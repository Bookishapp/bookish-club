import UIKit
import Messages

final class MessagesViewController: MSMessagesAppViewController, UITextFieldDelegate {
    private var state = ClubDataStore.card(kind: .rsvp)
    private var session: MSSession?
    private var knownCards: [UUID: MessageState] = [:]
    private var conversationKey: String?
    private var pending: (message: MSMessage, state: MessageState)?
    private var selectedRSVP: RSVPChoice = .yes
    private var selectedVote: String?
    private var invalidSelection = false
    private var showingStickers = false
    private var cardRows: [UIView] = []
    private let stickerPicker = StickerPickerViewController()
    private let content = UIStackView()
    private let choices = UIStackView()
    private let nameField = UITextField()
    private let pageField = UITextField()
    private let statusLabel = UILabel()
    private let detailLabel = UILabel()
    private let summaryLabel = UILabel()
    private let summaryCard = UIView()
    private let artView = UIImageView()
    private let mode = UISegmentedControl(items: ["RSVP", "Book vote", "Bookmarks", "Stickers"])
    private let addButton = UIButton(type: .system)
    private let newButton = UIButton(type: .system)

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = BookishTheme.cream
        BookishTheme.paperBackground(in: view)
        let scroll = UIScrollView(); scroll.keyboardDismissMode = .interactive
        scroll.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(scroll)
        content.axis = .vertical; content.spacing = 14; content.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(content)
        NSLayoutConstraint.activate([
            scroll.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            scroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            content.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: 20),
            content.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -20),
            content.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 16),
            content.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -24),
            content.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -40)
        ])
        let wordmark = UIImageView(image: UIImage(named: "BookishWordmark"))
        wordmark.contentMode = .scaleAspectFit
        wordmark.accessibilityLabel = "Bookish"; wordmark.isAccessibilityElement = true
        wordmark.widthAnchor.constraint(equalToConstant: 112).isActive = true
        wordmark.heightAnchor.constraint(equalToConstant: 38).isActive = true
        let header = UIStackView(arrangedSubviews: [wordmark, UIView()])
        header.axis = .horizontal
        content.addArrangedSubview(header)
        mode.selectedSegmentIndex = 0; mode.selectedSegmentTintColor = BookishTheme.wine
        mode.backgroundColor = BookishTheme.wine.withAlphaComponent(0.07)
        mode.setTitleTextAttributes([.foregroundColor: BookishTheme.card, .font: BookishTheme.font(.caption)], for: .selected)
        mode.heightAnchor.constraint(greaterThanOrEqualToConstant: 40).isActive = true
        mode.setTitleTextAttributes([.foregroundColor: BookishTheme.wine, .font: BookishTheme.font(.caption)], for: .normal)
        mode.addTarget(self, action: #selector(changeKind), for: .valueChanged)
        content.addArrangedSubview(mode)
        artView.contentMode = .scaleAspectFit; artView.isAccessibilityElement = false
        artView.widthAnchor.constraint(equalToConstant: 88).isActive = true
        artView.heightAnchor.constraint(equalToConstant: 100).isActive = true
        configure(detailLabel, style: .title)
        let hero = UIStackView(arrangedSubviews: [detailLabel, artView])
        hero.axis = .horizontal; hero.spacing = 8; hero.alignment = .center
        detailLabel.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        content.addArrangedSubview(hero)
        configure(summaryLabel, style: .caption)
        summaryLabel.textColor = BookishTheme.muted
        summaryCard.backgroundColor = BookishTheme.card
        summaryCard.layer.cornerRadius = 14; summaryCard.layer.borderColor = BookishTheme.line.cgColor
        summaryCard.layer.borderWidth = 1
        summaryLabel.translatesAutoresizingMaskIntoConstraints = false; summaryCard.addSubview(summaryLabel)
        NSLayoutConstraint.activate([
            summaryLabel.leadingAnchor.constraint(equalTo: summaryCard.leadingAnchor, constant: 14),
            summaryLabel.trailingAnchor.constraint(equalTo: summaryCard.trailingAnchor, constant: -14),
            summaryLabel.topAnchor.constraint(equalTo: summaryCard.topAnchor, constant: 12),
            summaryLabel.bottomAnchor.constraint(equalTo: summaryCard.bottomAnchor, constant: -12)
        ])
        configure(nameField, placeholder: "Reader")
        nameField.text = UserDefaults.standard.string(forKey: "BookishMessagesDisplayName")
        nameField.accessibilityLabel = "Your name on the card"
        configure(pageField, placeholder: "Page number"); pageField.keyboardType = .numberPad
        nameField.autocapitalizationType = .words; nameField.returnKeyType = .done
        choices.axis = .vertical; choices.spacing = 0; content.addArrangedSubview(choices)
        content.addArrangedSubview(label("Your name on the card", style: .caption))
        content.addArrangedSubview(nameField)
        content.addArrangedSubview(summaryCard)
        style(addButton, primary: true); addButton.setTitle("Add to message", for: .normal)
        addButton.addTarget(self, action: #selector(prepareMessage), for: .touchUpInside)
        content.addArrangedSubview(addButton)
        configure(statusLabel, style: .caption)
        content.addArrangedSubview(statusLabel)
        style(newButton, primary: false); newButton.setTitle("Start a new card", for: .normal)
        newButton.addTarget(self, action: #selector(startNewCard), for: .touchUpInside)
        content.addArrangedSubview(newButton)
        cardRows = Array(content.arrangedSubviews.dropFirst(2))
        addChild(stickerPicker)
        content.addArrangedSubview(stickerPicker.view)
        stickerPicker.view.heightAnchor.constraint(greaterThanOrEqualToConstant: 360).isActive = true
        let stickerHeight = stickerPicker.view.heightAnchor.constraint(equalTo: scroll.frameLayoutGuide.heightAnchor, constant: -100)
        stickerHeight.priority = .defaultHigh; stickerHeight.isActive = true
        stickerPicker.didMove(toParent: self)
        render()
    }

    override func willBecomeActive(with conversation: MSConversation) {
        super.willBecomeActive(with: conversation)
        loadViewIfNeeded()
        let key = ([conversation.localParticipantIdentifier.uuidString] + conversation.remoteParticipantIdentifiers.map { $0.uuidString }.sorted()).joined(separator: ":")
        if key != conversationKey {
            conversationKey = key; knownCards.removeAll(); session = nil; pending = nil
            state = ClubDataStore.card(kind: .rsvp); invalidSelection = false; showingStickers = false
            selectedRSVP = .yes; selectedVote = nil; pageField.text = nil
        }
        if let message = conversation.selectedMessage { select(message) }
        else { render() }
    }

    override func didSelect(_ message: MSMessage, conversation: MSConversation) { select(message) }

    override func didReceive(_ message: MSMessage, conversation: MSConversation) {
        guard let url = message.url, let incoming = try? MessageState.decode(url: url) else { return }
        let merged = knownCards[incoming.cardID].map { $0.merging(incoming) } ?? incoming
        knownCards[incoming.cardID] = merged
        // selectedMessage may still refer to an older revision. Keep the active session current.
        if incoming.cardID == state.cardID, message.session == session {
            state = state.merging(merged); render()
        }
    }

    override func didStartSending(_ message: MSMessage, conversation: MSConversation) {
        guard let draft = pending, draft.message.url == message.url else { return }
        state = state.cardID == draft.state.cardID ? state.merging(draft.state) : draft.state
        session = message.session
        knownCards[state.cardID] = state; pending = nil
        render(); setStatus("Your card was sent.")
    }

    override func didCancelSending(_ message: MSMessage, conversation: MSConversation) {
        guard pending?.message.url == message.url else { return }
        pending = nil; render(); setStatus("Card removed from the message. You can try again.")
    }

    private func select(_ message: MSMessage) {
        showingStickers = false
        if let draft = pending {
            render()
            setStatus(draft.message.url == message.url
                      ? "Ready in Messages. Tap Send, or remove the draft to keep editing."
                      : "Send or remove your current draft in Messages before opening another card.")
            return
        }
        guard let url = message.url, let decoded = try? MessageState.decode(url: url) else {
            invalidSelection = true; session = nil; render()
            setStatus("This card cannot be opened by this version of Bookish. Start a new card to continue.")
            return
        }
        let participant = activeConversation?.localParticipantIdentifier.uuidString ?? ""
        state = CardSelection.committedState(selected: decoded, isPending: message.isPending,
                                              known: knownCards[decoded.cardID], localParticipantID: participant)
        session = message.session; invalidSelection = false
        if message.isPending { pending = (message, decoded) }
        else { knownCards[state.cardID] = state }
        let formSnapshot = message.isPending ? decoded : state
        if let response = formSnapshot.responses.first(where: { $0.participantID == participant }) {
            selectedRSVP = response.rsvp ?? .yes; selectedVote = response.voteID
            pageField.text = response.page.map(String.init)
        } else { selectedRSVP = .yes; selectedVote = nil; pageField.text = nil }
        render()
    }

    @objc private func changeKind() {
        guard pending == nil else { return }
        if mode.selectedSegmentIndex == 3 { showingStickers = true; render(); return }
        guard CardKind.allCases.indices.contains(mode.selectedSegmentIndex) else { return }
        let kind = CardKind.allCases[mode.selectedSegmentIndex]
        if showingStickers && kind == state.kind { showingStickers = false; render(); return }
        showingStickers = false
        state = ClubDataStore.card(kind: kind)
        session = nil; invalidSelection = false; selectedVote = nil; selectedRSVP = .yes; pageField.text = nil
        render()
    }

    @objc private func startNewCard() {
        state = ClubDataStore.card(kind: state.kind); session = nil; pending = nil
        invalidSelection = false; selectedRSVP = .yes; selectedVote = nil; pageField.text = nil; render()
    }

    private func render() {
        guard isViewLoaded else { return }
        mode.selectedSegmentIndex = showingStickers ? 3 : (CardKind.allCases.firstIndex(of: state.kind) ?? 0)
        for row in cardRows {
            if showingStickers {
                content.removeArrangedSubview(row); row.removeFromSuperview()
            } else if row.superview == nil { content.addArrangedSubview(row) }
        }
        if showingStickers {
            if stickerPicker.view.superview == nil { content.addArrangedSubview(stickerPicker.view) }
        } else {
            content.removeArrangedSubview(stickerPicker.view); stickerPicker.view.removeFromSuperview()
        }
        artView.image = BookishTheme.art(for: state.kind)
        let heading = state.kind == .rsvp ? state.meetingTitle
            : state.kind == .vote ? "Pick the next book." : "Reading together"
        let detail = state.kind == .rsvp ? "\(state.meetingDetail)\n\(state.readingTitle)"
            : state.kind == .vote ? "Everyone gets a say. Choose a book to share with the chat."
            : "\(state.readingTitle)\nRead at your own pace."
        let heroText = NSMutableAttributedString(string: heading + "\n", attributes: [
            .font: BookishTheme.font(.title), .foregroundColor: BookishTheme.ink])
        heroText.append(NSAttributedString(string: detail, attributes: [
            .font: BookishTheme.font(.caption), .foregroundColor: BookishTheme.muted]))
        detailLabel.attributedText = heroText
        let memberLines = state.responses.map { member -> String in
            switch state.kind {
            case .rsvp: return "\(member.name): \(member.rsvp.map(BookishTheme.label) ?? "No RSVP yet")"
            case .vote:
                let title = state.candidates.first { $0.id == member.voteID }?.title ?? "No choice yet"
                return "\(member.name): \(title)"
            case .bookmarks: return "\(member.name): \(member.page.map { "page \($0)" } ?? "No bookmark yet")"
            }
        }
        summaryLabel.text = ([CardRenderer.summary(state)] + memberLines).joined(separator: "\n")
        summaryCard.backgroundColor = state.kind == .bookmarks ? BookishTheme.deepGreen : BookishTheme.card
        summaryLabel.textColor = state.kind == .bookmarks ? BookishTheme.mint : BookishTheme.muted
        choices.backgroundColor = state.kind == .vote ? BookishTheme.card : .clear
        choices.layer.cornerRadius = 14
        choices.layer.borderWidth = state.kind == .vote ? 1 : 0
        choices.layer.borderColor = BookishTheme.line.cgColor
        choices.spacing = state.kind == .vote ? 0 : 10
        summaryCard.isHidden = state.responses.isEmpty
        choices.arrangedSubviews.forEach { choices.removeArrangedSubview($0); $0.removeFromSuperview() }
        switch state.kind {
        case .rsvp:
            for choice in RSVPChoice.allCases {
                let button = choiceButton(BookishTheme.label(for: choice), selected: selectedRSVP == choice)
                button.addAction(UIAction { [weak self] _ in self?.selectedRSVP = choice; self?.render() }, for: .touchUpInside)
                choices.addArrangedSubview(button)
            }
        case .vote:
            for book in state.candidates {
                let button = bookChoice(book, selected: selectedVote == book.id)
                button.addAction(UIAction { [weak self] _ in self?.selectedVote = book.id; self?.render() }, for: .touchUpInside)
                choices.addArrangedSubview(button)
            }
        case .bookmarks:
            choices.addArrangedSubview(label("Your bookmark, from page 0 to \(state.totalPages)", style: .caption))
            choices.addArrangedSubview(pageField)
        }
        let editing = pending == nil
        addButton.isEnabled = editing && !invalidSelection
        mode.isEnabled = editing; newButton.isEnabled = editing
        nameField.isEnabled = editing; pageField.isEnabled = editing; choices.isUserInteractionEnabled = editing
        statusLabel.text = invalidSelection ? "Start a new card to continue." : pending == nil
            ? "Sample club details. Add your response, then tap Send in Messages."
            : "Ready in Messages. Tap Send to share, or remove the draft to keep editing."
    }

    @objc private func prepareMessage() {
        guard pending == nil, !invalidSelection, let conversation = activeConversation else {
            setStatus("Open Bookish inside an iMessage conversation to share a card."); return
        }
        view.endEditing(true)
        let name = (nameField.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        var outgoing = state
        do {
            if state.kind == .vote && selectedVote == nil { setStatus("Choose a book first."); return }
            let page = state.kind == .bookmarks ? Int(pageField.text ?? "") : nil
            if state.kind == .bookmarks && page == nil { setStatus("Enter a whole page number."); return }
            try outgoing.respond(participantID: conversation.localParticipantIdentifier.uuidString,
                                 name: name.isEmpty ? "Reader" : name,
                                 rsvp: state.kind == .rsvp ? selectedRSVP : nil,
                                 voteID: state.kind == .vote ? selectedVote : nil, page: page)
            let message = MSMessage(session: session ?? MSSession())
            let layout = MSMessageTemplateLayout()
            layout.image = CardRenderer.image(for: outgoing)
            layout.caption = state.kind == .rsvp ? state.meetingTitle : BookishTheme.title(for: state.kind)
            layout.subcaption = CardRenderer.summary(outgoing)
            message.layout = layout; message.url = try outgoing.messageURL()
            message.summaryText = "\(name.isEmpty ? "Reader" : name) updated \(BookishTheme.title(for: state.kind).lowercased())."
            message.accessibilityLabel = "\(layout.caption ?? "Bookish"). \(layout.subcaption ?? "")"
            pending = (message, outgoing); render()
            conversation.insert(message) { [weak self] error in
                DispatchQueue.main.async {
                    guard let self = self, self.pending?.message === message else { return }
                    if error != nil {
                        self.pending = nil; self.render(); self.setStatus("The card could not be added. Please try again.")
                    } else {
                        UserDefaults.standard.set(name.isEmpty ? "Reader" : name, forKey: "BookishMessagesDisplayName")
                        self.setStatus("Ready in Messages. Tap Send to share your card.")
                    }
                }
            }
        } catch {
            setStatus("Check your name, book choice, and page number. This card may be full.")
        }
    }

    private func label(_ text: String, style: BookishTheme.TypeStyle) -> UILabel {
        let result = UILabel(); configure(result, style: style); result.text = text; return result
    }
    private func configure(_ label: UILabel, style: BookishTheme.TypeStyle) {
        label.font = BookishTheme.font(style); label.textColor = BookishTheme.ink
        label.numberOfLines = 0; label.adjustsFontForContentSizeCategory = true
    }
    private func configure(_ field: UITextField, placeholder: String) {
        field.placeholder = placeholder; field.font = BookishTheme.font(.body); field.textColor = BookishTheme.ink
        field.backgroundColor = BookishTheme.card; field.borderStyle = .none
        field.layer.cornerRadius = 12; field.layer.borderWidth = 1.5; field.layer.borderColor = BookishTheme.line.cgColor
        field.leftView = UIView(frame: CGRect(x: 0, y: 0, width: 14, height: 1)); field.leftViewMode = .always
        field.rightView = UIView(frame: CGRect(x: 0, y: 0, width: 14, height: 1)); field.rightViewMode = .always
        field.adjustsFontForContentSizeCategory = true; field.delegate = self; field.accessibilityLabel = placeholder
        field.heightAnchor.constraint(greaterThanOrEqualToConstant: 48).isActive = true
    }
    private func style(_ button: UIButton, primary: Bool) {
        var config = UIButton.Configuration.filled()
        config.baseBackgroundColor = primary ? BookishTheme.wine : BookishTheme.card
        config.baseForegroundColor = primary ? BookishTheme.card : BookishTheme.wine
        config.titleTextAttributesTransformer = UIConfigurationTextAttributesTransformer { incoming in
            var result = incoming; result.font = BookishTheme.font(.button); return result
        }
        config.cornerStyle = .capsule; config.contentInsets = NSDirectionalEdgeInsets(top: 13, leading: 16, bottom: 13, trailing: 16)
        button.configuration = config; button.titleLabel?.numberOfLines = 0
        button.titleLabel?.adjustsFontForContentSizeCategory = true
        button.heightAnchor.constraint(greaterThanOrEqualToConstant: 48).isActive = true
    }
    private func choiceButton(_ title: String, selected: Bool) -> UIButton {
        let button = UIButton(type: .system); style(button, primary: false)
        var config = button.configuration ?? .filled()
        config.baseBackgroundColor = selected ? BookishTheme.lilac : BookishTheme.card
        config.baseForegroundColor = BookishTheme.ink
        config.background.cornerRadius = 14; config.cornerStyle = .fixed
        config.background.strokeWidth = selected ? 1.5 : 1
        config.background.strokeColor = selected ? BookishTheme.wine : BookishTheme.line
        config.image = selected ? UIImage(systemName: "checkmark.circle.fill") : UIImage(systemName: "circle")
        config.imagePlacement = .trailing; config.imagePadding = 12
        config.titleAlignment = .leading
        let lines = title.components(separatedBy: "\n")
        if lines.count > 1 {
            let titleFont = BookishTheme.font(.heading).withSize(UIFontMetrics(forTextStyle: .headline).scaledValue(for: 16))
            let styled = NSMutableAttributedString(string: lines[0], attributes: [.font: titleFont, .foregroundColor: BookishTheme.ink])
            styled.append(NSAttributedString(string: "\n" + lines.dropFirst().joined(separator: "\n"), attributes: [
                .font: BookishTheme.font(.caption), .foregroundColor: BookishTheme.muted]))
            config.titleTextAttributesTransformer = nil
            config.attributedTitle = AttributedString(styled)
        } else { config.title = title }
        button.configuration = config
        button.contentHorizontalAlignment = .fill
        button.accessibilityTraits = selected ? [.button, .selected] : [.button]
        return button
    }
    private func bookChoice(_ book: CandidateBook, selected: Bool) -> UIButton {
        let button = UIButton(type: .custom)
        button.backgroundColor = selected ? BookishTheme.lilac : .clear
        button.layer.cornerRadius = 12
        let title = label(book.title, style: .heading)
        title.font = BookishTheme.font(.heading).withSize(UIFontMetrics(forTextStyle: .headline).scaledValue(for: 17))
        let author = label(book.author, style: .caption); author.textColor = BookishTheme.muted
        let description = label(book.reason, style: .caption); description.textColor = BookishTheme.muted
        let text = UIStackView(arrangedSubviews: [title, author, description])
        text.axis = .vertical; text.spacing = 3
        let check = UIImageView(image: BookishTheme.selectionMark(selected: selected))
        check.widthAnchor.constraint(equalToConstant: 24).isActive = true
        check.heightAnchor.constraint(equalToConstant: 24).isActive = true
        let row = UIStackView(); row.axis = .horizontal; row.spacing = 11; row.alignment = .center
        if let image = BookishTheme.cover(for: book) {
            let cover = UIImageView(image: image); cover.contentMode = .scaleAspectFill
            cover.clipsToBounds = true; cover.layer.cornerRadius = 3
            cover.widthAnchor.constraint(equalToConstant: 40).isActive = true
            cover.heightAnchor.constraint(equalToConstant: 60).isActive = true
            row.addArrangedSubview(cover)
        }
        row.addArrangedSubview(text); row.addArrangedSubview(check)
        row.isUserInteractionEnabled = false; row.translatesAutoresizingMaskIntoConstraints = false
        button.addSubview(row)
        NSLayoutConstraint.activate([
            row.leadingAnchor.constraint(equalTo: button.leadingAnchor, constant: 12),
            row.trailingAnchor.constraint(equalTo: button.trailingAnchor, constant: -12),
            row.topAnchor.constraint(equalTo: button.topAnchor, constant: 12),
            row.bottomAnchor.constraint(equalTo: button.bottomAnchor, constant: -12),
            button.heightAnchor.constraint(greaterThanOrEqualToConstant: 88)
        ])
        button.isAccessibilityElement = true
        button.accessibilityLabel = "\(book.title), \(book.author). \(book.reason)"
        button.accessibilityTraits = selected ? [.button, .selected] : [.button]
        return button
    }
    private func setStatus(_ text: String) {
        statusLabel.text = text; UIAccessibility.post(notification: .announcement, argument: text)
    }
    func textFieldShouldReturn(_ textField: UITextField) -> Bool { textField.resignFirstResponder(); return true }
}
