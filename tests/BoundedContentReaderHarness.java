// @module tests/bounded-content-reader-harness
import local.nexus.remote.BoundedContentReader;
import java.io.*;
import java.util.Arrays;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

public class BoundedContentReaderHarness {
    private static void check(boolean condition) { if (!condition) throw new AssertionError(); }
    private static void waitFor(AtomicBoolean flag) throws Exception {
        for (int i = 0; i < 100 && !flag.get(); i++) Thread.sleep(10);
        check(flag.get());
    }
    public static void main(String[] args) throws Exception {
        byte[] data = new byte[1536]; Arrays.fill(data, (byte) 7);
        AtomicBoolean closed = new AtomicBoolean();
        byte[] result = BoundedContentReader.read(() -> new ByteArrayInputStream(data) {
            public void close() { closed.set(true); }
        }, () -> {}, data.length, 500);
        check(Arrays.equals(result, data) && closed.get());
        closed.set(false);
        try {
            BoundedContentReader.read(() -> new ByteArrayInputStream(data) {
                public void close() { closed.set(true); }
            }, () -> {}, 100, 500);
            throw new AssertionError("oversize accepted");
        } catch (IOException expected) { check(closed.get()); }
        // Backup callers retain their existing 16 MiB cap, independently from composer size.
        check(BoundedContentReader.read(() -> new ByteArrayInputStream(data), () -> {}, 16 * 1024 * 1024, 500).length == data.length);
        AtomicBoolean cancelled = new AtomicBoolean();
        closed.set(false);
        long start = System.nanoTime();
        try {
            BoundedContentReader.read(() -> new InputStream() {
                public int read() { return 0; }
                public int read(byte[] b, int off, int len) { return 0; }
                public void close() { closed.set(true); }
            }, () -> cancelled.set(true), 100, 40);
            throw new AssertionError("zero-read provider never timed out");
        } catch (TimeoutException expected) { check(TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - start) < 1000); }
        waitFor(cancelled); waitFor(closed);
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        BoundedContentReader.write(() -> output, () -> {}, data, 500);
        check(Arrays.equals(data, output.toByteArray()));
        AtomicBoolean entered = new AtomicBoolean();
        closed.set(false); cancelled.set(false);
        try {
            BoundedContentReader.write(() -> new OutputStream() {
                public void write(int b) throws IOException { entered.set(true); while (!closed.get()) { try { Thread.sleep(2); } catch (InterruptedException ignored) {} } throw new IOException("closed"); }
                public void close() { closed.set(true); }
            }, () -> cancelled.set(true), data, 40);
            throw new AssertionError("blocked writer never timed out");
        } catch (TimeoutException expected) { check(entered.get()); }
        waitFor(cancelled); waitFor(closed);
        // A descriptor arriving after cancellation is closed before any content is read.
        AtomicBoolean lateClosed = new AtomicBoolean(); AtomicInteger lateReads = new AtomicInteger();
        try {
            BoundedContentReader.read(() -> {
                long end = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(100);
                while (System.nanoTime() < end) { try { Thread.sleep(2); } catch (InterruptedException ignored) { Thread.currentThread().interrupt(); } }
                return new ByteArrayInputStream(data) {
                    public int read(byte[] b, int off, int len) { lateReads.incrementAndGet(); return super.read(b, off, len); }
                    public void close() { lateClosed.set(true); }
                };
            }, () -> {}, 100, 30);
            throw new AssertionError("late opener accepted");
        } catch (TimeoutException expected) {}
        waitFor(lateClosed); check(lateReads.get() == 0);
        check(BoundedContentReader.previewSampleSize(1000, 1000) == 1);
        check(BoundedContentReader.previewSampleSize(6000, 4000) == 4);
        check(BoundedContentReader.previewSampleSize(10000, 10000) == 8);
        check(BoundedContentReader.previewSampleSize(32768, 32768) == 0);
        check(BoundedContentReader.previewSampleSize(Integer.MAX_VALUE, Integer.MAX_VALUE) == 0);
        check(BoundedContentReader.previewSampleSize(-1, 100) == 0);
        Thread.currentThread().interrupt();
        try { BoundedContentReader.call(() -> "late", () -> {}, 100); throw new AssertionError("interrupt ignored"); }
        catch (InterruptedException expected) { check(Thread.interrupted()); }
        System.out.println("PASS content bytes, deadlines, cancellation, late resources, export and preview bounds");
    }
}
