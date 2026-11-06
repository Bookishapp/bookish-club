// Review-only host. This file is never referenced by the production Xcode project.
import UIKit
import Messages

@main
final class ParityHost: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let mode = ProcessInfo.processInfo.arguments.dropFirst().first ?? "editor-rsvp"
        let controller: UIViewController
        if mode.hasPrefix("transcript-") {
            let kind: CardKind = mode.contains("bookmarks") ? .bookmarks : mode.contains("vote") ? .vote : .rsvp
            var state = MessageState.sample(kind: kind)
            if !mode.contains("empty") {
                for (index, name) in ["Reader A", "Reader B", "Reader C", "Reader D"].enumerated() {
                    try! state.respond(participantID: "parity-\(index)", name: name,
                        rsvp: kind == .rsvp ? [.yes, .yes, .maybe, .cant][index] : nil,
                        voteID: kind == .vote ? state.candidates[index % 3].id : nil,
                        page: kind == .bookmarks ? [212, 64, 260, 432][index] : nil)
                }
            }
            if mode.contains("long") {
                state.meetingTitle = "A very long club night title for a lively conversation with all of our reading friends"
                state.readingTitle = "An unusually long book title that needs more than a single line in our shared reading room"
            }
            controller = TranscriptHost(state: state)
        } else if mode == "drawer-icon" {
            controller = IconHost()
        } else {
            let editor = MessagesViewController()
            editor.loadViewIfNeeded()
            if let segmented = descendant(of: UISegmentedControl.self, in: editor.view) {
                segmented.selectedSegmentIndex = mode.contains("stickers") ? 3 : mode.contains("vote") ? 1 : mode.contains("bookmarks") ? 2 : 0
                segmented.sendActions(for: .valueChanged)
            }
            if mode.contains("selected"), let button = allSubviews(in: editor.view).compactMap({ $0 as? UIButton })
                .first(where: { $0.accessibilityLabel?.hasPrefix("Pride and Prejudice,") == true }) {
                button.sendActions(for: .touchUpInside)
            }
            if mode.contains("error"), let button = allSubviews(in: editor.view).compactMap({ $0 as? UIButton }).first(where: { $0.currentTitle == "Add to message" }) {
                button.sendActions(for: .touchUpInside)
            }
            controller = editor
        }
        let window = UIWindow(frame: UIScreen.main.bounds)
        if mode.contains("large-type") {
            let wrapper = UIViewController()
            wrapper.addChild(controller); wrapper.view.addSubview(controller.view)
            controller.view.frame = wrapper.view.bounds; controller.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            controller.didMove(toParent: wrapper)
            wrapper.setOverrideTraitCollection(UITraitCollection(preferredContentSizeCategory: .accessibilityExtraExtraExtraLarge), forChild: controller)
            window.rootViewController = wrapper
        } else { window.rootViewController = controller }
        window.makeKeyAndVisible(); self.window = window
        if mode.contains("scrolled") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
                if let scroll = self.descendant(of: UIScrollView.self, in: controller.view) {
                    scroll.setContentOffset(CGPoint(x: 0, y: max(0, scroll.contentSize.height - scroll.bounds.height + scroll.adjustedContentInset.bottom)), animated: false)
                }
            }
        }
        return true
    }
    private func allSubviews(in view: UIView) -> [UIView] {
        [view] + view.subviews.flatMap { allSubviews(in: $0) }
    }
    private func descendant<T: UIView>(of type: T.Type, in view: UIView) -> T? {
        if let result = view as? T { return result }
        return view.subviews.compactMap { descendant(of: type, in: $0) }.first
    }
}

private final class TranscriptHost: UIViewController {
    let state: MessageState
    init(state: MessageState) { self.state = state; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { fatalError() }
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = BookishTheme.cream
        BookishTheme.paperBackground(in: view)
        let image = CardRenderer.image(for: state)
        // Preserve the exact generated transcript snapshot for direct review.
        let path = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("card.png")
        try! image.pngData()!.write(to: path)
        let imageView = UIImageView(image: image)
        imageView.contentMode = .scaleAspectFit; imageView.layer.cornerRadius = 18; imageView.clipsToBounds = true
        imageView.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(imageView)
        NSLayoutConstraint.activate([
            imageView.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            imageView.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
            imageView.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            imageView.heightAnchor.constraint(equalTo: imageView.widthAnchor, multiplier: image.size.height / image.size.width)
        ])
    }
}
private final class IconHost: UIViewController {
    override func viewDidLoad() {
        super.viewDidLoad(); view.backgroundColor = BookishTheme.cream; BookishTheme.paperBackground(in: view)
        let icon = UIImageView(image: UIImage(named: "BookishIcon"))
        icon.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(icon)
        icon.layer.cornerRadius = 20; icon.clipsToBounds = true
        NSLayoutConstraint.activate([
            icon.widthAnchor.constraint(equalToConstant: 120), icon.heightAnchor.constraint(equalToConstant: 120),
            icon.centerXAnchor.constraint(equalTo: view.centerXAnchor), icon.centerYAnchor.constraint(equalTo: view.centerYAnchor)
        ])
    }
}
