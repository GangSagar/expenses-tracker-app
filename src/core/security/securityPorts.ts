import { SettingsRepository } from '../settings/SettingsRepository';

export interface SecuritySettingsRepository extends SettingsRepository {}

export interface DeviceAuthStatus {
  isAvailable: boolean;
  hasBiometrics: boolean;
  isDeviceSecure: boolean;
}

export interface DeviceAuthProvider {
  getStatus(): Promise<DeviceAuthStatus>;
  authenticate(title: string, subtitle: string): Promise<boolean>;
  cancelAuthentication(): Promise<boolean>;
  setSecureFlag(enable: boolean): Promise<boolean>;
}
