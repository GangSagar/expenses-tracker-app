import { NativeModules, Platform } from 'react-native';
import { DeviceAuthProvider, DeviceAuthStatus } from '../../core/security/securityPorts';

const { SecurityModule } = NativeModules;
const unavailable: DeviceAuthStatus = { isAvailable: false, hasBiometrics: false, isDeviceSecure: false };

export class ReactNativeDeviceAuthProvider implements DeviceAuthProvider {
  async getStatus(): Promise<DeviceAuthStatus> {
    if (Platform.OS !== 'android' || !SecurityModule?.isDeviceAuthAvailable) return unavailable;
    const result = await SecurityModule.isDeviceAuthAvailable();
    return {
      isAvailable: Boolean(result?.isAvailable),
      hasBiometrics: Boolean(result?.hasBiometrics),
      isDeviceSecure: Boolean(result?.isDeviceSecure),
    };
  }

  async authenticate(title: string, subtitle: string): Promise<boolean> {
    if (Platform.OS !== 'android' || !SecurityModule?.authenticate) return false;
    return Boolean(await SecurityModule.authenticate(title, subtitle));
  }

  async cancelAuthentication(): Promise<boolean> {
    if (Platform.OS !== 'android' || !SecurityModule?.cancelAuthentication) return false;
    return Boolean(await SecurityModule.cancelAuthentication());
  }

  async setSecureFlag(enable: boolean): Promise<boolean> {
    if (Platform.OS !== 'android' || !SecurityModule?.setSecureFlag) return false;
    return Boolean(await SecurityModule.setSecureFlag(enable));
  }
}
