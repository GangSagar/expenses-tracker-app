#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(TransactionNotificationModule, NSObject)
RCT_EXTERN_METHOD(showSavedNotification:(NSString *)title body:(NSString *)body)
@end
