import UIKit
import Capacitor
import WebKit

final class BookishViewController: CAPBridgeViewController {
    // v3 is oxblood on every screen, so the status bar uses light content.
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(BookishMapPlugin())
        bridge?.registerPluginInstance(BookishMessagesPlugin())
        #if DEBUG && targetEnvironment(simulator)
        // Explicit local fixture scripts are available only in simulator Debug builds.
        if let path = ProcessInfo.processInfo.environment["BOOKISH_QA_SCRIPT"],
           let script = try? String(contentsOfFile: path, encoding: .utf8) {
            webView?.configuration.userContentController.addUserScript(
                WKUserScript(source: script, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
            )
        }
        #endif
        #if DEBUG
        // Simulator QA only: `SIMCTL_CHILD_BOOKISH_QA_TAB=read xcrun simctl launch ...`
        // opens a tab so CI can screenshot every screen. Compiled out of Release builds.
        if let tab = ProcessInfo.processInfo.environment["BOOKISH_QA_TAB"],
           ["near", "read", "saved", "me"].contains(tab) {
            DispatchQueue.main.asyncAfter(deadline: .now() + 4) { [weak self] in
                self?.webView?.evaluateJavaScript("document.querySelector('[data-tab=\"\(tab)\"]')?.click()")
            }
        }
        #endif
    }
}
