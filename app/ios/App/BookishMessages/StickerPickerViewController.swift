import UIKit
import Messages

/// Messages supplies sticker tapping and peeling. This controller never sends a message.
final class StickerPickerViewController: UIViewController, MSStickerBrowserViewDataSource {
    private let browser = MSStickerBrowserView(frame: .zero, stickerSize: .small)
    private let helpLabel = UILabel()
    private let titleLabel = UILabel()
    private var stickers: [MSSticker] = []

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = BookishTheme.cream
        BookishTheme.paperBackground(in: view)
        titleLabel.text = "Bookish Stickers"
        titleLabel.font = BookishTheme.font(.heading); titleLabel.textColor = BookishTheme.ink
        titleLabel.adjustsFontForContentSizeCategory = true; titleLabel.numberOfLines = 0
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(titleLabel)
        helpLabel.font = BookishTheme.font(.caption)
        helpLabel.textColor = BookishTheme.wine
        helpLabel.numberOfLines = 0
        helpLabel.adjustsFontForContentSizeCategory = true
        helpLabel.translatesAutoresizingMaskIntoConstraints = false
        browser.backgroundColor = .clear
        browser.translatesAutoresizingMaskIntoConstraints = false
        browser.contentInset = UIEdgeInsets(top: 8, left: 12, bottom: 16, right: 12)
        view.addSubview(helpLabel)
        view.addSubview(browser)
        NSLayoutConstraint.activate([
            helpLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20),
            helpLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20),
            titleLabel.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            titleLabel.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            titleLabel.topAnchor.constraint(equalTo: view.topAnchor, constant: 8),
            helpLabel.topAnchor.constraint(equalTo: titleLabel.bottomAnchor, constant: 6),
            browser.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            browser.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            browser.topAnchor.constraint(equalTo: helpLabel.bottomAnchor, constant: 8),
            browser.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])

        // Advertise only successfully loaded stickers, so missing or invalid files
        // produce an empty or partial browser without force-unwrapping resources.
        let resources = BookishTheme.stickerAssets
        stickers = resources.compactMap { resource in
            guard let url = Bundle.main.url(forResource: resource.name, withExtension: "png") else { return nil }
            return try? MSSticker(contentsOfFileURL: url, localizedDescription: resource.label)
        }
        if stickers.isEmpty {
            helpLabel.text = "Sticker art is unavailable in this build."
            browser.isHidden = true
        } else {
            helpLabel.text = stickers.count == resources.count
                ? "Lunair · \(stickers.count) stickers. Tap to add, or hold to place on a bubble."
                : "Some sticker art is unavailable in this build. Tap an available sticker to add it to your message."
            browser.dataSource = self
            browser.reloadData()
        }
    }

    func numberOfStickers(in stickerBrowserView: MSStickerBrowserView) -> Int {
        stickers.count
    }

    func stickerBrowserView(_ stickerBrowserView: MSStickerBrowserView, stickerAt index: Int) -> MSSticker {
        // The browser requests indices within the loaded count above. The array
        // stays unchanged after the data source is connected.
        stickers[index]
    }
}
