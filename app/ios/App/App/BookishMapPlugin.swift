import UIKit
import MapKit
import Capacitor

@objc(BookishMapPlugin)
public class BookishMapPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "BookishMapPlugin"
    public let jsName = "BookishMap"
    public let pluginMethods: [CAPPluginMethod] = [CAPPluginMethod(name: "present", returnType: CAPPluginReturnPromise)]
    private var showing = false

    @objc func present(_ call: CAPPluginCall) {
        guard let cities = call.getArray("cities", JSObject.self) else {
            call.reject("Choose a city to explore the map."); return
        }
        DispatchQueue.main.async { [weak self] in
            guard let self = self, !self.showing, let host = self.bridge?.viewController else {
                call.reject("The map is already open. Explore a city there."); return
            }
            self.showing = true
            let controller = BookishMapController(cities: cities, selected: call.getString("selected")) { [weak self] key in
                self?.showing = false
                if let key = key { call.resolve(["cityKey": key]) } else { call.resolve() }
            }
            let navigation = UINavigationController(rootViewController: controller)
            navigation.modalPresentationStyle = .pageSheet
            host.present(navigation, animated: true)
            navigation.presentationController?.delegate = controller
        }
    }
}

private final class CityPin: MKPointAnnotation {
    let key: String
    init(key: String, count: Int, coordinate: CLLocationCoordinate2D) {
        self.key = key
        super.init()
        self.coordinate = coordinate
        self.title = key
        self.subtitle = "\(count) book clubs · City center"
    }
}

private final class BookishMapController: UIViewController, MKMapViewDelegate, UIAdaptivePresentationControllerDelegate {
    private let map = MKMapView()
    private let cities: [JSObject]
    private let selected: String?
    private var completed = false
    private let finish: (String?) -> Void
    init(cities: [JSObject], selected: String?, finish: @escaping (String?) -> Void) {
        self.cities = cities; self.selected = selected; self.finish = finish
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { fatalError("Use the city initializer") }
    override func viewDidLoad() {
        super.viewDidLoad()
        title = "A city of stories"
        navigationItem.rightBarButtonItem = UIBarButtonItem(barButtonSystemItem: .done, target: self, action: #selector(done))
        view.backgroundColor = .systemBackground
        let note = UILabel()
        note.text = "Pins show city centers. Tap a pin to find clubs."
        note.font = .preferredFont(forTextStyle: .footnote)
        note.numberOfLines = 0
        note.textAlignment = .center
        note.adjustsFontForContentSizeCategory = true
        map.translatesAutoresizingMaskIntoConstraints = false
        note.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(note); view.addSubview(map)
        NSLayoutConstraint.activate([
            note.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 12),
            note.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16),
            note.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16),
            map.topAnchor.constraint(equalTo: note.bottomAnchor, constant: 12),
            map.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            map.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            map.bottomAnchor.constraint(equalTo: view.bottomAnchor)
        ])
        map.delegate = self
        map.showsUserLocation = false
        map.pointOfInterestFilter = .excludingAll
        let pins = cities.compactMap { city -> CityPin? in
            guard let key = city["key"] as? String, let lat = city["lat"] as? Double,
                  let lng = city["lng"] as? Double, let count = city["count"] as? Int,
                  CLLocationCoordinate2DIsValid(CLLocationCoordinate2D(latitude: lat, longitude: lng)) else { return nil }
            return CityPin(key: key, count: count, coordinate: CLLocationCoordinate2D(latitude: lat, longitude: lng))
        }
        map.addAnnotations(pins)
        if let pin = pins.first(where: { $0.key == selected }) {
            map.setRegion(MKCoordinateRegion(center: pin.coordinate, latitudinalMeters: 90_000, longitudinalMeters: 90_000), animated: false)
            map.selectAnnotation(pin, animated: false)
        } else {
            map.setRegion(MKCoordinateRegion(center: CLLocationCoordinate2D(latitude: 38.5, longitude: -98), span: MKCoordinateSpan(latitudeDelta: 40, longitudeDelta: 65)), animated: false)
        }
    }
    func mapView(_ mapView: MKMapView, viewFor annotation: MKAnnotation) -> MKAnnotationView? {
        guard annotation is CityPin else { return nil }
        let pin = (mapView.dequeueReusableAnnotationView(withIdentifier: "city") as? MKMarkerAnnotationView) ?? MKMarkerAnnotationView(annotation: annotation, reuseIdentifier: "city")
        pin.annotation = annotation
        pin.markerTintColor = UIColor(red: 29/255, green: 90/255, blue: 70/255, alpha: 1)
        pin.glyphImage = UIImage(systemName: "books.vertical.fill")
        pin.clusteringIdentifier = "bookish-cities"
        pin.canShowCallout = true
        let button = UIButton(type: .detailDisclosure)
        button.accessibilityLabel = "View clubs in this city"
        pin.rightCalloutAccessoryView = button
        return pin
    }
    func mapView(_ mapView: MKMapView, annotationView view: MKAnnotationView, calloutAccessoryControlTapped control: UIControl) {
        guard let city = view.annotation as? CityPin else { return }
        complete(city.key)
    }
    private func complete(_ key: String?) {
        guard !completed else { return }
        completed = true
        dismiss(animated: true) { self.finish(key) }
    }
    @objc private func done() { complete(nil) }
    func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
        guard !completed else { return }
        completed = true; finish(nil)
    }
}
