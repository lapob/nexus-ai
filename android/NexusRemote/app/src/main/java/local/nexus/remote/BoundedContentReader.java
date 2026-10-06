package local.nexus.remote;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.Future;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicReference;

/** Provider calls never occupy chat workers; even an uncooperative provider has bounded admission. */
public final class BoundedContentReader {
    private static final ThreadFactory DAEMON = task -> {
        Thread thread = new Thread(task, "nexus-content");
        thread.setDaemon(true);
        return thread;
    };
    private static final ThreadPoolExecutor IO = new ThreadPoolExecutor(
        2, 2, 0, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(2), DAEMON);
    private static final ThreadPoolExecutor CLOSE = new ThreadPoolExecutor(
        2, 2, 0, TimeUnit.MILLISECONDS, new ArrayBlockingQueue<>(2), DAEMON);
    private BoundedContentReader() {}

    public static <T> T call(Callable<T> operation, Runnable cancellation, long timeoutMs) throws Exception {
        if (timeoutMs <= 0 || timeoutMs > 30_000) throw new IllegalArgumentException("Invalid provider deadline");
        if (Thread.currentThread().isInterrupted()) throw new InterruptedException();
        Future<T> future = IO.submit(operation);
        try {
            return future.get(timeoutMs, TimeUnit.MILLISECONDS);
        } catch (TimeoutException | InterruptedException error) {
            future.cancel(true);
            IO.purge();
            try { CLOSE.execute(cancellation); } catch (java.util.concurrent.RejectedExecutionException ignored) {
                // Never spawn replacements for a provider that also refuses resource closure.
            }
            if (error instanceof InterruptedException) Thread.currentThread().interrupt();
            throw error;
        } catch (ExecutionException error) {
            Throwable cause = error.getCause();
            if (cause instanceof Exception) throw (Exception) cause;
            if (cause instanceof Error) throw (Error) cause;
            throw new IOException("Provider failure", cause);
        }
    }

    public static byte[] read(Callable<InputStream> opener, Runnable cancelProvider, int limit, long timeoutMs) throws Exception {
        if (limit < 1 || limit > 16 * 1024 * 1024) throw new IllegalArgumentException("Invalid content limit");
        AtomicReference<InputStream> active = new AtomicReference<>();
        return call(() -> {
            try (InputStream input = opener.call()) {
                if (input == null) throw new IOException("Content unavailable");
                active.set(input);
                ByteArrayOutputStream output = new ByteArrayOutputStream(Math.min(limit, 64 * 1024));
                byte[] buffer = new byte[8 * 1024];
                while (true) {
                    if (Thread.currentThread().isInterrupted()) throw new InterruptedException();
                    int count = input.read(buffer, 0, Math.min(buffer.length, limit - output.size() + 1));
                    if (Thread.currentThread().isInterrupted()) throw new InterruptedException();
                    if (count < 0) break;
                    if (count == 0) { Thread.sleep(1); continue; }
                    if (count > limit - output.size()) throw new IOException("Content too large");
                    output.write(buffer, 0, count);
                }
                return output.toByteArray();
            } finally { active.set(null); }
        }, () -> {
            try { cancelProvider.run(); } finally {
                InputStream input = active.get();
                if (input != null) try { input.close(); } catch (IOException ignored) {}
            }
        }, timeoutMs);
    }

    public static void write(Callable<OutputStream> opener, Runnable cancelProvider, byte[] bytes, long timeoutMs) throws Exception {
        if (bytes.length > 16 * 1024 * 1024) throw new IOException("Content too large");
        AtomicReference<OutputStream> active = new AtomicReference<>();
        call(() -> {
            try (OutputStream output = opener.call()) {
                if (output == null) throw new IOException("Content unavailable");
                active.set(output);
                for (int offset = 0; offset < bytes.length; offset += 8192) {
                    if (Thread.currentThread().isInterrupted()) throw new InterruptedException();
                    output.write(bytes, offset, Math.min(8192, bytes.length - offset));
                }
                if (Thread.currentThread().isInterrupted()) throw new InterruptedException();
                output.flush();
                return null;
            } finally { active.set(null); }
        }, () -> {
            try { cancelProvider.run(); } finally {
                OutputStream output = active.get();
                if (output != null) try { output.close(); } catch (IOException ignored) {}
            }
        }, timeoutMs);
    }

    /** Bounds-only decoding precedes this; power-of-two sampling caps preview allocation. */
    public static int previewSampleSize(int width, int height) {
        if (width < 1 || height < 1 || width > 32_768 || height > 32_768
            || (long) width * height > 100_000_000L) return 0;
        int sample = 1;
        while (((long) width + sample - 1) / sample > 1_536
            || ((long) height + sample - 1) / sample > 1_536) sample *= 2;
        return sample;
    }
}
