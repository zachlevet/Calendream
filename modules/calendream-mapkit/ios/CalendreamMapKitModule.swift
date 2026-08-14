import ExpoModulesCore
import MapKit

private final class MapSearchException: GenericException<String>, @unchecked Sendable {
  override var reason: String { param }
}

private final class CompletionRequest: NSObject, MKLocalSearchCompleterDelegate {
  let completer = MKLocalSearchCompleter()
  let promise: Promise
  let finished: () -> Void

  init(query: String, promise: Promise, finished: @escaping () -> Void) {
    self.promise = promise
    self.finished = finished
    super.init()
    completer.delegate = self
    completer.resultTypes = [.address, .pointOfInterest]
    completer.queryFragment = query
  }

  func completerDidUpdateResults(_ completer: MKLocalSearchCompleter) {
    let suggestions = completer.results.prefix(7).map { result in
      ["title": result.title, "subtitle": result.subtitle]
    }
    promise.resolve(Array(suggestions))
    finished()
  }

  func completer(_ completer: MKLocalSearchCompleter, didFailWithError error: Error) {
    promise.reject(MapSearchException(error.localizedDescription))
    finished()
  }
}

public class CalendreamMapKitModule: Module {
  private var completionRequests: [UUID: CompletionRequest] = [:]

  public func definition() -> ModuleDefinition {
    Name("CalendreamMapKit")

    AsyncFunction("suggestAsync") { (query: String, promise: Promise) in
      let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
      guard trimmed.count >= 2 else {
        promise.resolve([])
        return
      }

      DispatchQueue.main.async {
        let id = UUID()
        let request = CompletionRequest(query: trimmed, promise: promise) { [weak self] in
          self?.completionRequests.removeValue(forKey: id)
        }
        self.completionRequests[id] = request
      }
    }

    AsyncFunction("resolveAsync") { (query: String, promise: Promise) in
      let request = MKLocalSearch.Request()
      request.naturalLanguageQuery = query
      request.resultTypes = [.address, .pointOfInterest]
      MKLocalSearch(request: request).start { response, error in
        if let error {
          promise.reject(MapSearchException(error.localizedDescription))
          return
        }
        guard let item = response?.mapItems.first else {
          promise.reject(MapSearchException("No matching location was found."))
          return
        }
        let coordinate = item.placemark.coordinate
        promise.resolve([
          "name": item.name ?? query,
          "address": item.placemark.title ?? query,
          "latitude": coordinate.latitude,
          "longitude": coordinate.longitude
        ])
      }
    }

    AsyncFunction("openInMapsAsync") { (name: String, address: String, latitude: Double, longitude: Double, promise: Promise) in
      DispatchQueue.main.async {
        let coordinate = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
        let placemark = MKPlacemark(coordinate: coordinate)
        let item = MKMapItem(placemark: placemark)
        item.name = name.isEmpty ? address : name
        promise.resolve(item.openInMaps())
      }
    }
  }
}
