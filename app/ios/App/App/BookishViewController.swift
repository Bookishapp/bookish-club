import UIKit
import Capacitor

final class BookishViewController: CAPBridgeViewController {
    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(BookishMapPlugin())
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
