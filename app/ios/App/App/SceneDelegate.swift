import UIKit

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    private var appDelegate: AppDelegate? {
        UIApplication.shared.delegate as? AppDelegate
    }

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard scene is UIWindowScene else { return }
        // UIKit creates the window and Bookish controller from the Main storyboard.
        appDelegate?.window = window
        forward(connectionOptions.urlContexts)
        for activity in connectionOptions.userActivities {
            forward(activity)
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        forward(URLContexts)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        forward(userActivity)
    }

    func sceneWillResignActive(_ scene: UIScene) {
        appDelegate?.applicationWillResignActive(UIApplication.shared)
    }

    func sceneDidEnterBackground(_ scene: UIScene) {
        appDelegate?.applicationDidEnterBackground(UIApplication.shared)
    }

    func sceneWillEnterForeground(_ scene: UIScene) {
        appDelegate?.applicationWillEnterForeground(UIApplication.shared)
    }

    func sceneDidBecomeActive(_ scene: UIScene) {
        appDelegate?.applicationDidBecomeActive(UIApplication.shared)
    }

    func sceneDidDisconnect(_ scene: UIScene) {
        if appDelegate?.window === window {
            appDelegate?.window = nil
        }
    }

    private func forward(_ contexts: Set<UIOpenURLContext>) {
        for context in contexts {
            var options: [UIApplication.OpenURLOptionsKey: Any] = [
                .openInPlace: context.options.openInPlace
            ]
            if let sourceApplication = context.options.sourceApplication {
                options[.sourceApplication] = sourceApplication
            }
            if let annotation = context.options.annotation {
                options[.annotation] = annotation
            }
            if let eventAttribution = context.options.eventAttribution {
                options[.eventAttribution] = eventAttribution
            }
            // The existing callback forwards to Capacitor's ApplicationDelegateProxy.
            _ = appDelegate?.application(UIApplication.shared, open: context.url, options: options)
        }
    }

    private func forward(_ activity: NSUserActivity) {
        _ = appDelegate?.application(UIApplication.shared, continue: activity, restorationHandler: { _ in })
    }
}
