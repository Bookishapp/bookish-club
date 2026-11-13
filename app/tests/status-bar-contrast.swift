// Check fresh simctl screenshots from iOS builds that use light status content.
// Usage: swift tests/status-bar-contrast.swift [--paper-detail] screenshot.png [screenshot.png ...]
import AppKit
import Foundation

let requirePaper = CommandLine.arguments.contains("--paper-detail")
let paths = CommandLine.arguments.dropFirst().filter { $0 != "--paper-detail" }
precondition(!paths.isEmpty, "Supply fresh simulator screenshots")
var failed = false
for path in paths {
    guard let source = NSImage(contentsOfFile: path) else { fatalError("Cannot read screenshot") }
    var bounds = NSRect(origin: .zero, size: source.size)
    let image = source.cgImage(forProposedRect: &bounds, context: nil, hints: nil)!
    let width = image.width, height = image.height
    var bytes = [UInt8](repeating: 0, count: width * height * 4)
    bytes.withUnsafeMutableBytes { buffer in
        let context = CGContext(data: buffer.baseAddress, width: width, height: height,
            bitsPerComponent: 8, bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
    }
    // Sample both status wings, excluding the central camera and rounded corners.
    // Permit sparse white glyphs, but reject a light background behind them.
    var light = 0, total = 0
    for y in stride(from: Int(Double(height) * 0.012), to: Int(Double(height) * 0.045), by: 3) {
        for x in stride(from: Int(Double(width) * 0.08), to: Int(Double(width) * 0.92), by: 3) {
            if x > width * 32 / 100 && x < width * 68 / 100 { continue }
            let i = (y * width + x) * 4
            let rgb = (0..<3).map { channel -> Double in
                let value = Double(bytes[i + channel]) / 255
                return value <= 0.04045 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4)
            }
            let luminance = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]
            if 1.05 / (luminance + 0.05) < 3 { light += 1 }
            total += 1
        }
    }
    let fraction = Double(light) / Double(total)
    var paper = 0, bodySamples = 0
    for y in stride(from: height * 15 / 100, to: height * 40 / 100, by: 9) {
        for x in stride(from: width / 10, to: width * 9 / 10, by: 9) {
            let i = (y * width + x) * 4
            if bytes[i] > 180 && bytes[i + 1] > 150 && bytes[i + 2] < bytes[i] { paper += 1 }
            bodySamples += 1
        }
    }
    let paperVisible = Double(paper) / Double(bodySamples) > 0.60
    if requirePaper && !paperVisible { print("FAIL: expected paper detail content is absent") }
    let pass = fraction < 0.20 && (!requirePaper || paperVisible)
    print("\(pass ? "PASS" : "FAIL") \(URL(fileURLWithPath: path).lastPathComponent): \(Int(fraction * 100))% low-contrast status pixels")
    failed = failed || !pass
}
exit(failed ? 1 : 0)
