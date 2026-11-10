import UIKit
import Messages

/// Native MSStickerView keeps Messages' tap and peel interactions for every sticker.
final class StickerPickerViewController: UIViewController {
    private let helpLabel = UILabel()
    private let grid = UIStackView()
    private var stickers: [MSSticker] = []

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = BookishTheme.cream
        BookishTheme.paperBackground(in: view)
        let logo = UIImageView(image: UIImage(named: "BookishWordmark"))
        logo.contentMode = .scaleAspectFit; logo.isAccessibilityElement = true; logo.accessibilityLabel = "Bookish"
        logo.widthAnchor.constraint(equalToConstant: 56).isActive = true
        logo.heightAnchor.constraint(equalToConstant: 24).isActive = true
        let title = UILabel(); title.text = "stickers"; title.font = BookishTheme.font(.button)
        title.textColor = BookishTheme.ink; title.adjustsFontForContentSizeCategory = true
        helpLabel.font = BookishTheme.font(.caption); helpLabel.textColor = BookishTheme.muted
        helpLabel.textAlignment = .right; helpLabel.adjustsFontForContentSizeCategory = true
        let header = UIStackView(arrangedSubviews: [logo, title, UIView(), helpLabel])
        header.axis = .horizontal; header.spacing = 12; header.alignment = .center
        header.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(header)
        let scroll = UIScrollView(); scroll.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(scroll)
        grid.axis = .vertical; grid.spacing = 6; grid.translatesAutoresizingMaskIntoConstraints = false; scroll.addSubview(grid)
        NSLayoutConstraint.activate([
            header.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            header.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            header.topAnchor.constraint(equalTo: view.topAnchor, constant: 12),
            header.heightAnchor.constraint(greaterThanOrEqualToConstant: 26),
            scroll.topAnchor.constraint(equalTo: header.bottomAnchor, constant: 8),
            scroll.leadingAnchor.constraint(equalTo: view.leadingAnchor), scroll.trailingAnchor.constraint(equalTo: view.trailingAnchor), scroll.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            grid.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: 10),
            grid.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -10),
            grid.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor), grid.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -16),
            grid.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -20)
        ])
        stickers = BookishTheme.stickerAssets.compactMap { resource in
            guard let url = Bundle.main.url(forResource: resource.name, withExtension: "png") else { return nil }
            return try? MSSticker(contentsOfFileURL: url, localizedDescription: resource.label)
        }
        helpLabel.text = stickers.isEmpty ? "Art unavailable" : "Lunair, \(stickers.count) stickers"
        for start in stride(from: 0, to: stickers.count, by: 3) {
            let row = UIStackView(); row.axis = .horizontal; row.distribution = .fillEqually; row.spacing = 6
            for index in start..<(start + 3) {
                if index < stickers.count {
                    let sticker = MSStickerView(frame: .zero, sticker: stickers[index])
                    sticker.accessibilityLabel = stickers[index].localizedDescription
                    sticker.heightAnchor.constraint(equalTo: sticker.widthAnchor, multiplier: 1.08).isActive = true
                    row.addArrangedSubview(sticker)
                } else { row.addArrangedSubview(UIView()) }
            }
            grid.addArrangedSubview(row)
        }
    }
}
