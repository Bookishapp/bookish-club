// Review host only. The native cards, editor, sticker browser, and widgets are production code.
// Conversation chrome and fixture messages are a labelled simulator review shell.
import UIKit
import SwiftUI
import Messages

@main
final class ParityHost: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions options: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let mode = ProcessInfo.processInfo.arguments.dropFirst().first ?? "20"
        let window = UIWindow(frame: UIScreen.main.bounds)
        window.rootViewController = ReviewController(mode: mode)
        window.makeKeyAndVisible(); self.window = window
        return true
    }
}
final class ReviewController: UIViewController {
    let mode: String
    init(mode: String) { self.mode = mode; super.init(nibName:nil,bundle:nil) }
    required init?(coder: NSCoder) { fatalError() }
    override func viewDidLoad() {
        super.viewDidLoad(); view.backgroundColor = .white
        if mode == "24" { widgets(); return }
        chrome()
        if mode == "20" || mode == "21" { transcript() }
        else {
            bubble(mode == "22" ? "we need a next book before\nthursday" : "chapter 34. the proposal. I'm on\nthe floor", name:mode == "22" ? "Dee" : "Maya", y:176)
            if mode == "22" { bubble("something with a little more\nyearning pls", name:"Priya",y:268) }
            if mode == "23" {
                sticker("lunair-sticker-04-no-spoilers",frame:CGRect(x:273,y:148,width:75,height:85))
                sticker("lunair-sticker-06-swooning",frame:CGRect(x:250,y:248,width:115,height:130))
            }
            composer(y:457)
            let child: UIViewController
            if mode == "22" {
                let editor=MessagesViewController(); editor.loadViewIfNeeded()
                let segmented = descendants(editor.view).compactMap{$0 as? UISegmentedControl}.first!
                segmented.selectedSegmentIndex=1;segmented.sendActions(for:.valueChanged)
                if let choice = descendants(editor.view).compactMap({ $0 as? UIButton }).first(where: { $0.accessibilityLabel?.hasPrefix("Emma,") == true }) { choice.sendActions(for: .touchUpInside) }
                child=editor
            } else { child=StickerPickerViewController() }
            addChild(child);child.view.frame=CGRect(x:0,y:512,width:390,height:332);view.addSubview(child.view);child.didMove(toParent:self)
        }
    }
    private func chrome() {
        let header=UIView(frame:CGRect(x:0,y:50,width:390,height:92));header.backgroundColor=UIColor(white:0.975,alpha:1);view.addSubview(header)
        label("‹", frame:CGRect(x:16,y:78,width:30,height:30),size:32,color:.systemBlue)
        for (i, text) in ["J","P","K"].enumerated() { let b=UILabel(frame:CGRect(x:158+i*23,y:74,width:29,height:29));b.text=text;b.textAlignment = .center;b.font = .systemFont(ofSize:12,weight:.bold);b.backgroundColor=[BookishTheme.butter,BookishTheme.hex(0x9DD0B4),BookishTheme.pink][i];b.layer.cornerRadius=14.5;b.clipsToBounds=true;view.addSubview(b) }
        label("Book Club ›",frame:CGRect(x:153,y:106,width:110,height:22),size:12)
        let line=UIView(frame:CGRect(x:0,y:141,width:390,height:0.5));line.backgroundColor = .systemGray4;view.addSubview(line)
    }
    private func transcript() {
        bubble(mode == "20" ? "ok who's actually coming\nthursday" : "done with the letter. who do I\ntalk to", name:mode == "20" ? "Priya" : "Kat",y:176)
        label("Jess",frame:CGRect(x:25,y:248,width:120,height:20),size:11,color:.systemGray)
        var state=MessageState.sample(kind:mode == "20" ? .rsvp : .bookmarks)
        state.meetingTitle="7:30 at Jess's";state.meetingDetail="Up to ch. 30"
        for (i,name) in ["Kat","Priya","Jess","Maya","Dee"].enumerated() { try! state.respond(participantID:"fixture-\(i)",name:name,rsvp:mode == "20" ? (i == 4 ? .maybe : .yes) : nil,page:mode == "21" ? [241,238,236,212,190][i] : nil) }
        let meetingJSON = #"{"kind":"meeting","id":"11111111-1111-4111-8111-111111111111","title":"7:30 at Jess's","starts_at":"2026-10-22T19:30:00-07:00","status":"scheduled","counts":{"yes":4,"maybe":1,"cant":0},"open_items":[{"id":"22222222-2222-4222-8222-222222222222","label":"Cookies"},{"id":"33333333-3333-4333-8333-333333333333","label":"Cheese"}]}"#
        if mode == "21" { state.responses = ["Kat", "Priya", "Jess"].compactMap { name in state.responses.first { $0.name == name } } }
        let art = mode == "20" ? ServerCardRenderer.image(for: try! ServerMessageCard.decode(data: Data(meetingJSON.utf8))) : CardRenderer.image(for:state)
        let card=UIImageView(image:art);card.frame=CGRect(x:12,y:268,width:269,height:202);card.contentMode = .scaleAspectFit;card.clipsToBounds=true;card.layer.cornerRadius=17;card.layer.maskedCorners=[.layerMinXMinYCorner,.layerMaxXMinYCorner];view.addSubview(card)
        let caption=UIView(frame:CGRect(x:12,y:470,width:269,height:46));caption.backgroundColor=UIColor(white:0.94,alpha:1);caption.layer.cornerRadius=16;caption.layer.maskedCorners=[.layerMinXMaxYCorner,.layerMaxXMaxYCorner];view.addSubview(caption)
        let icon=UIImageView(image:UIImage(named:"BookishIcon"));icon.frame=CGRect(x:24,y:480,width:24,height:24);icon.layer.cornerRadius=5;icon.clipsToBounds=true;view.addSubview(icon)
        label(mode == "20" ? "Thursday at Jess's" : "Reading together",frame:CGRect(x:56,y:478,width:210,height:18),size:13)
        label("Bookish",frame:CGRect(x:56,y:496,width:210,height:17),size:11,color:.systemGray)
        let outgoing=UILabel(frame:CGRect(x:mode == "20" ? 158 : 220,y:530,width:mode == "20" ? 220 : 158,height:39));outgoing.backgroundColor = .systemBlue;outgoing.layer.cornerRadius=20;outgoing.clipsToBounds=true;outgoing.textColor = .white;outgoing.textAlignment = .center;outgoing.font = .systemFont(ofSize:16);outgoing.text=mode == "20" ? "in. I'm bringing the cookies" : "I'm on 212, behave";view.addSubview(outgoing)
        bubble(mode == "20" ? "tapped I'm in. cheese board is\nmine" : "sealed my take. you'll see it\nwhen you get there",name:mode == "20" ? "Kat" : "Priya",y:600)
        if mode == "20" { sticker("lunair-sticker-02-im-in",frame:CGRect(x:257,y:567,width:84,height:94)) }
        composer(y:758)
    }
    private func bubble(_ text:String,name:String,y:CGFloat) {
        label(name,frame:CGRect(x:25,y:y-22,width:130,height:20),size:11,color:.systemGray)
        let bubble=UILabel(frame:CGRect(x:12,y:y,width:262,height:60));bubble.backgroundColor=UIColor(white:0.915,alpha:1);bubble.layer.cornerRadius=21;bubble.clipsToBounds=true;bubble.numberOfLines=0;bubble.text="   "+text.replacingOccurrences(of:"\n",with:"\n   ");bubble.font = .systemFont(ofSize:16);view.addSubview(bubble)
    }
    private func composer(y:CGFloat) {
        let bg=UIView(frame:CGRect(x:0,y:y,width:390,height:56));bg.backgroundColor = .white;view.addSubview(bg)
        let line=UIView(frame:CGRect(x:0,y:y,width:390,height:0.5));line.backgroundColor = .systemGray4;view.addSubview(line)
        label("+",frame:CGRect(x:12,y:y+10,width:34,height:34),size:28,color:.systemGray)
        let field=UILabel(frame:CGRect(x:56,y:y+10,width:322,height:36));field.text="   iMessage";field.textColor = .systemGray2;field.font = .systemFont(ofSize:16);field.layer.cornerRadius=18;field.layer.borderWidth=1;field.layer.borderColor=UIColor.systemGray4.cgColor;view.addSubview(field)
    }
    private func widgets() {
        BookishTheme.paperBackground(in:view,oxblood:true)
        let raw = #"{"readingTitle":"Pride and Prejudice","page":212,"totalPages":480,"stopPage":247,"stopLabel":"Thursday's stop","friendsReading":3,"meetingTitle":"7:30 at Jess's","meetingDetail":"Up to ch. 30","meetingDay":"Thursday","going":true,"newTakes":6,"sealedTakes":2,"chapter":34}"#
        let s=try! WidgetSnapshot.decode(Data(raw.utf8))
        for (style,frame) in [(BookishWidgetStyle.reading,CGRect(x:24,y:78,width:342,height:170)),(.meeting,CGRect(x:24,y:300,width:165,height:165)),(.tea,CGRect(x:201,y:300,width:165,height:165))] {
            let host=UIHostingController(rootView:BookishWidgetView(snapshot:s,style:style));host.view.backgroundColor = .clear;addChild(host);host.view.frame=frame;view.addSubview(host.view);host.didMove(toParent:self)
            label("Bookish",frame:CGRect(x:frame.minX,y:frame.maxY+5,width:frame.width,height:20),size:12,color:.white,center:true)
        }
        let dock=UIView(frame:CGRect(x:30,y:734,width:330,height:85));dock.backgroundColor=UIColor.white.withAlphaComponent(0.18);dock.layer.cornerRadius=30;view.addSubview(dock)
    }
    private func label(_ text:String,frame:CGRect,size:CGFloat,color:UIColor = .black,center:Bool=false) { let label=UILabel(frame:frame);label.text=text;label.textColor=color;label.font = .systemFont(ofSize:size);label.textAlignment=center ? .center : .left;view.addSubview(label) }
    private func sticker(_ name:String,frame:CGRect) { let image=UIImageView(image:UIImage(contentsOfFile:Bundle.main.url(forResource:name,withExtension:"png")!.path));image.contentMode = .scaleAspectFit;image.frame=frame;view.addSubview(image) }
    private func descendants(_ view:UIView)->[UIView] { [view]+view.subviews.flatMap{descendants($0)} }
}
