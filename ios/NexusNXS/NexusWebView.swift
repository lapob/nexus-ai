import SwiftUI
import WebKit

/// Reuses the public conversation and Core without a privileged JavaScript bridge.
struct NexusWebView: UIViewRepresentable {
    let reloadID: UUID
    @Binding var unavailable: Bool
    private static let origin = URL(string: "https://ai.nexusnxs.com/")!

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.allowsInlineMediaPlayback = true
        let view = WKWebView(frame: .zero, configuration: configuration)
        view.navigationDelegate = context.coordinator
        view.uiDelegate = context.coordinator
        view.isOpaque = false
        view.backgroundColor = .clear
        view.scrollView.backgroundColor = .clear
        context.coordinator.lastReloadID = reloadID
        view.load(URLRequest(url: Self.origin))
        return view
    }

    func updateUIView(_ view: WKWebView, context: Context) {
        context.coordinator.parent = self
        if context.coordinator.lastReloadID != reloadID {
            context.coordinator.lastReloadID = reloadID
            view.load(URLRequest(url: Self.origin))
        }
    }

    static func dismantleUIView(_ view: WKWebView, coordinator: Coordinator) {
        view.stopLoading()
        view.navigationDelegate = nil
        view.uiDelegate = nil
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKUIDelegate {
        var parent: NexusWebView
        var lastReloadID: UUID?
        init(_ parent: NexusWebView) { self.parent = parent }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            parent.unavailable = false
        }

        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
            if (error as NSError).code != NSURLErrorCancelled { parent.unavailable = true }
        }

        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
            if (error as NSError).code != NSURLErrorCancelled { parent.unavailable = true }
        }

        func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
            parent.unavailable = true
        }

        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
            guard let url = action.request.url,
                  url.scheme == "https", url.user == nil, url.password == nil else {
                decisionHandler(.cancel)
                return
            }
            if url.host == Self.allowedHost && (url.port == nil || url.port == 443) {
                if action.targetFrame == nil {
                    decisionHandler(.cancel)
                    webView.load(action.request)
                } else { decisionHandler(.allow) }
            } else {
                decisionHandler(.cancel)
                // Redirects cannot silently open another origin outside the app.
                if action.navigationType == .linkActivated { UIApplication.shared.open(url) }
            }
        }

        private static let allowedHost = "ai.nexusnxs.com"

        func webView(_ webView: WKWebView, requestMediaCapturePermissionFor origin: WKSecurityOrigin, initiatedByFrame frame: WKFrameInfo, type: WKMediaCaptureType, decisionHandler: @escaping (WKPermissionDecision) -> Void) {
            let trusted = origin.protocol == "https" && origin.host == Self.allowedHost
                && (origin.port == 0 || origin.port == 443) && frame.isMainFrame
            decisionHandler(trusted ? .prompt : .deny)
        }
    }
}
