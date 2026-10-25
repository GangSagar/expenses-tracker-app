import Foundation
import React
import UserNotifications

@objc(TransactionNotificationModule)
class TransactionNotificationModule: NSObject, RCTBridgeModule {
  static func moduleName() -> String! {
    return "TransactionNotificationModule"
  }

  static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc func showSavedNotification(_ title: String, body: String) {
    let center = UNUserNotificationCenter.current()
    center.getNotificationSettings { settings in
      if settings.authorizationStatus == .notDetermined {
        center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
          if granted {
            self.enqueueNotification(center: center, title: title, body: body)
          } else {
            NSLog("Transaction saved; notification permission was not granted.")
          }
        }
      } else if settings.authorizationStatus == .authorized ||
        settings.authorizationStatus == .provisional ||
        settings.authorizationStatus == .ephemeral {
        self.enqueueNotification(center: center, title: title, body: body)
      } else {
        NSLog("Transaction saved; notification permission is unavailable.")
      }
    }
  }

  private func enqueueNotification(center: UNUserNotificationCenter, title: String, body: String) {
    let content = UNMutableNotificationContent()
    content.title = title
    content.body = body
    content.sound = .default
    let request = UNNotificationRequest(
      identifier: UUID().uuidString,
      content: content,
      trigger: nil
    )
    center.add(request) { error in
      if let error = error {
        NSLog("Transaction saved, but its notification could not be scheduled: %@", error.localizedDescription)
      }
    }
  }
}
