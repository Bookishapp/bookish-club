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
    private var serverResource: MessageResource?
    private let serverPanel = UIStackView()
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
        BookishTheme.paperBackground(in: view, oxblood: true)
        let scroll = UIScrollView(); scroll.keyboardDismissMode = .interactive
        scroll.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(scroll)
        content.axis = .vertical; content.spacing = 6; content.translatesAutoresizingMaskIntoConstraints = false
        scroll.addSubview(content)
        NSLayoutConstraint.activate([
            scroll.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor),
            scroll.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor),
            scroll.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            scroll.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
            content.leadingAnchor.constraint(equalTo: scroll.contentLayoutGuide.leadingAnchor, constant: 20),
            content.trailingAnchor.constraint(equalTo: scroll.contentLayoutGuide.trailingAnchor, constant: -20),
            content.topAnchor.constraint(equalTo: scroll.contentLayoutGuide.topAnchor, constant: 8),
            content.bottomAnchor.constraint(equalTo: scroll.contentLayoutGuide.bottomAnchor, constant: -24),
            content.widthAnchor.constraint(equalTo: scroll.frameLayoutGuide.widthAnchor, constant: -40)
        ])
        let wordmark = UIImageView(image: UIImage(named: "BookishWordmark"))
        wordmark.contentMode = .scaleAspectFit
        wordmark.accessibilityLabel = "Bookish"; wordmark.isAccessibilityElement = true
        wordmark.widthAnchor.constraint(equalToConstant: 112).isActive = true
        wordmark.heightAnchor.constraint(equalToConstant: 18).isActive = true
        let menu = UIButton(type: .system)
        menu.setImage(UIImage(systemName: "ellipsis.circle.fill"), for: .normal)
        menu.tintColor = BookishTheme.card
        menu.accessibilityLabel = "Choose a Bookish card"
        menu.showsMenuAsPrimaryAction = true
        menu.menu = UIMenu(children: ["RSVP", "Book vote", "Bookmarks", "Stickers"].enumerated().map { index, title in
            UIAction(title: title) { [weak self] _ in self?.mode.selectedSegmentIndex = index; self?.changeKind() }
        })
        let header = UIStackView(arrangedSubviews: [wordmark, UIView(), menu])
        header.axis = .horizontal
        content.addArrangedSubview(header)
        mode.selectedSegmentIndex = 0; mode.selectedSegmentTintColor = BookishTheme.wine
        mode.backgroundColor = BookishTheme.wine.withAlphaComponent(0.07)
        mode.setTitleTextAttributes([.foregroundColor: BookishTheme.card, .font: BookishTheme.font(.caption)], for: .selected)
        mode.heightAnchor.constraint(greaterThanOrEqualToConstant: 40).isActive = true
        mode.setTitleTextAttributes([.foregroundColor: BookishTheme.wine, .font: BookishTheme.font(.caption)], for: .normal)
        mode.addTarget(self, action: #selector(changeKind), for: .valueChanged)
        mode.isHidden = true; content.addArrangedSubview(mode)
        artView.contentMode = .scaleAspectFit; artView.isAccessibilityElement = false
        artView.widthAnchor.constraint(equalToConstant: 100).isActive = true
        artView.heightAnchor.constraint(equalToConstant: 52).isActive = true
        configure(detailLabel, style: .title)
        let hero = UIStackView(arrangedSubviews: [artView, detailLabel])
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
        style(addButton, primary: true); addButton.setTitle("Send to the chat", for: .normal)
        addButton.addTarget(self, action: #selector(prepareMessage), for: .touchUpInside)
        content.insertArrangedSubview(addButton, at: 4)
        configure(statusLabel, style: .caption)
        content.addArrangedSubview(statusLabel)
        style(newButton, primary: false); newButton.setTitle("Start a new card", for: .normal)
        newButton.addTarget(self, action: #selector(startNewCard), for: .touchUpInside)
        content.addArrangedSubview(newButton)
        cardRows = Array(content.arrangedSubviews.dropFirst(2))
        serverPanel.axis = .vertical; serverPanel.spacing = 18
        serverPanel.addArrangedSubview(label("Open your club in Bookish", style: .title))
        serverPanel.addArrangedSubview(label("Sign in to view this conversation. Tea stays sealed until a fresh page check allows it.", style: .body))
        let open = UIButton(type: .system); style(open, primary: true)
        open.setTitle("Open Bookish", for: .normal)
        open.addTarget(self, action: #selector(openServerResource), for: .touchUpInside)
        serverPanel.addArrangedSubview(open)
        serverPanel.isHidden = true
        content.insertArrangedSubview(serverPanel, at: 2)
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
            serverResource = nil
            state = ClubDataStore.card(kind: .rsvp); invalidSelection = false; showingStickers = false
            selectedRSVP = .yes; selectedVote = nil; pageField.text = nil
        }
        if let message = conversation.selectedMessage {
            select(message, openServer: serverResource?.url != message.url)
        }
        else { serverResource = nil; render() }
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

    private func select(_ message: MSMessage, openServer: Bool = true) {
        serverResource = nil
        showingStickers = false
        if let draft = pending {
            render()
            setStatus(draft.message.url == message.url
                      ? "Ready in Messages. Tap Send, or remove the draft to keep editing."
                      : "Send or remove your current draft in Messages before opening another card.")
            return
        }
        // Server cards never enter the self-contained v1 editor, or reveal inline.
        if let url = message.url, let resource = try? MessageResource.decode(url: url) {
            loadViewIfNeeded()
            serverResource = resource; render()
            if openServer { openServerResource() }
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

    @objc private func openServerResource() {
        guard let resource = serverResource else { return }
        extensionContext?.open(resource.appURL) { [weak self] opened in
            DispatchQueue.main.async {
                self?.setStatus(opened ? "Open Bookish to sign in and view this conversation." : "Open Bookish and choose your club to view this conversation.")
            }
        }
    }

    @objc private func changeKind() {
        serverResource = nil
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
        serverPanel.isHidden = serverResource == nil
        cardRows.forEach { $0.isHidden = serverResource != nil }
        if serverResource != nil {
            mode.isEnabled = true
            content.removeArrangedSubview(stickerPicker.view); stickerPicker.view.removeFromSuperview()
            return
        }
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
        artView.image = BookishTheme.editorArt(for: state.kind)
        let heading = state.kind == .rsvp ? state.meetingTitle
            : state.kind == .vote ? "Next book vote" : "Reading together"
        let detail = state.kind == .rsvp ? "\(state.meetingDetail)\n\(state.readingTitle)"
            : state.kind == .vote ? ""
            : "\(state.readingTitle)\nRead at your own pace."
        let heroText = NSMutableAttributedString(string: heading + (detail.isEmpty ? "" : "\n"), attributes: [
            .font: BookishTheme.font(.title), .foregroundColor: BookishTheme.card])
        heroText.append(NSAttributedString(string: detail, attributes: [
            .font: BookishTheme.font(.caption), .foregroundColor: BookishTheme.cream]))
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
        choices.spacing = state.kind == .vote ? 8 : 10
        choices.axis = state.kind == .vote ? .horizontal : .vertical
        choices.distribution = state.kind == .vote ? .fillEqually : .fill
        addButton.setTitle(state.kind == .vote ? "Send vote to the chat" : "Send to the chat", for: .normal)
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
        statusLabel.textColor = BookishTheme.card
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
        config.baseBackgroundColor = primary ? BookishTheme.green : BookishTheme.card
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
                .font: BookishTheme.font(.caption), .foregroundColor: BookishTheme.cream]))
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
        button.backgroundColor = .clear
        let title = label(book.title, style: .button); title.textAlignment = .center
        title.font = BookishTheme.font(.button).withSize(12)
        title.numberOfLines = 2; title.adjustsFontSizeToFitWidth = true; title.minimumScaleFactor = 0.8
        title.heightAnchor.constraint(equalToConstant: 30).isActive = true
        let reason = label(book.reason, style: .caption); reason.textAlignment = .center
        reason.numberOfLines = 2; reason.adjustsFontSizeToFitWidth = true; reason.minimumScaleFactor = 0.8
        reason.heightAnchor.constraint(equalToConstant: 28).isActive = true
        reason.font = BookishTheme.font(.caption).withSize(10); reason.textColor = BookishTheme.wine
        let cover = UIImageView(image: BookishTheme.cover(for: book)); cover.contentMode = .scaleAspectFit
        cover.heightAnchor.constraint(equalToConstant: 70).isActive = true
        let check = UIImageView(image: UIImage(systemName: selected ? "checkmark.circle.fill" : "circle"))
        check.tintColor = BookishTheme.green; check.contentMode = .scaleAspectFit
        check.heightAnchor.constraint(equalToConstant: 20).isActive = true
        let coverBox = UIView(); coverBox.heightAnchor.constraint(equalToConstant: 72).isActive = true
        cover.translatesAutoresizingMaskIntoConstraints = false; check.translatesAutoresizingMaskIntoConstraints = false
        coverBox.addSubview(cover); coverBox.addSubview(check)
        NSLayoutConstraint.activate([cover.centerXAnchor.constraint(equalTo: coverBox.centerXAnchor), cover.widthAnchor.constraint(equalToConstant: 60), cover.topAnchor.constraint(equalTo: coverBox.topAnchor), check.trailingAnchor.constraint(equalTo: coverBox.trailingAnchor, constant: -6), check.bottomAnchor.constraint(equalTo: coverBox.bottomAnchor), check.widthAnchor.constraint(equalToConstant: 20)])
        let column = UIStackView(arrangedSubviews: [coverBox, title, reason])
        column.axis = .vertical; column.spacing = 4
        column.isUserInteractionEnabled = false; column.translatesAutoresizingMaskIntoConstraints = false
        button.addSubview(column)
        NSLayoutConstraint.activate([
            column.leadingAnchor.constraint(equalTo: button.leadingAnchor, constant: 4),
            column.trailingAnchor.constraint(equalTo: button.trailingAnchor, constant: -4),
            column.topAnchor.constraint(equalTo: button.topAnchor, constant: 6),
            column.bottomAnchor.constraint(equalTo: button.bottomAnchor, constant: -6),
            button.heightAnchor.constraint(greaterThanOrEqualToConstant: 150)
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
