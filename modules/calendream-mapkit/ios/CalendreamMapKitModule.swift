import ExpoModulesCore
import CoreText
import MapKit
import UIKit

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
    let suggestions = completer.results.prefix(5).map { result in
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

    AsyncFunction("createJournalPDFAsync") { (text: String, filename: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          let safeFilename = filename.replacingOccurrences(of: "/", with: "-")
          let url = FileManager.default.temporaryDirectory.appendingPathComponent(safeFilename)
          let pageBounds = CGRect(x: 0, y: 0, width: 612, height: 792)
          let textBounds = pageBounds.insetBy(dx: 54, dy: 58)
          let paragraph = NSMutableParagraphStyle()
          paragraph.lineSpacing = 3
          paragraph.paragraphSpacing = 7
          let attributed = NSAttributedString(
            string: text,
            attributes: [
              .font: UIFont.systemFont(ofSize: 11.5),
              // A PDF does not inherit the app's appearance. Always use black so
              // an export created in Dark Mode remains readable on white paper.
              .foregroundColor: UIColor.black,
              .paragraphStyle: paragraph
            ]
          )
          let framesetter = CTFramesetterCreateWithAttributedString(attributed)
          let renderer = UIGraphicsPDFRenderer(bounds: pageBounds)

          try renderer.writePDF(to: url) { rendererContext in
            var location = 0
            repeat {
              rendererContext.beginPage()
              let path = CGPath(rect: textBounds, transform: nil)
              let frame = CTFramesetterCreateFrame(framesetter, CFRange(location: location, length: 0), path, nil)
              let context = rendererContext.cgContext
              context.saveGState()
              context.textMatrix = .identity
              context.translateBy(x: 0, y: pageBounds.height)
              context.scaleBy(x: 1, y: -1)
              CTFrameDraw(frame, context)
              context.restoreGState()

              let visible = CTFrameGetVisibleStringRange(frame)
              guard visible.length > 0 else { break }
              location += visible.length
            } while location < attributed.length
          }
          promise.resolve(url.absoluteString)
        } catch {
          promise.reject(MapSearchException(error.localizedDescription))
        }
      }
    }
  }
}
