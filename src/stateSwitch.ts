import {Service, PlatformAccessory, CharacteristicValue, Logger, HAPStatus} from 'homebridge';
import {BshbError, BshbErrorType} from 'bosch-smart-home-bridge';

import * as packageJson from './package.json';
import {BoschRoomClimateControlPlatform} from './platform';
import {pretty} from './utils';

import {
  AccessoryContext,
  BoschDeviceServiceData,
  BoschDevice,
  BoschUserDefinedState, isUserDefinedState,
} from './types';

const ON: boolean = true;
const OFF: boolean = false;

export type SwitchState =
  typeof ON |
  typeof OFF;

export type AccessoryState = {
  available: boolean;
  deviceState: SwitchState;
};

export class BoschUserDefinedStateSwitch {
  private timeoutId!: NodeJS.Timeout;

  private state: AccessoryState = {
    available: true,
    deviceState: OFF,
  };

  public get type(): typeof Service.Switch {
    return this.platform.Service.Switch;
  }

  public get service(): Service {
    return this.platformAccessory.getService(this.type) || this.platformAccessory.addService(this.type);
  }

  constructor(
    readonly platform: BoschRoomClimateControlPlatform,
    readonly platformAccessory: PlatformAccessory<BoschUserDefinedState>,
  ) {
    this.log.info('Creating accessory...');

    this.platformAccessory.getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, 'BOSCH')
      .setCharacteristic(this.platform.Characteristic.Model, 'User Defined State')
      .setCharacteristic(this.platform.Characteristic.SerialNumber, platformAccessory.context.id)
      .setCharacteristic(this.platform.Characteristic.FirmwareRevision, packageJson.version);

    this.registerHandlers();
  }

  public dispose(): void {
    this.log.info('Disposing accessory...');
    this.stopPeriodicStateSync();
  }

  public getLocalState(): AccessoryState {
    return {...this.state};
  }

  public setUnavailable(): void {
    this.log.warn('Setting accessory to unavailable...');

    this.state.available = false;

    this.service.updateCharacteristic(
      this.platform.Characteristic.On,
      new Error('Current state unavailable'),
    );
  }

  public onBoschEvent(deviceServiceData: BoschDeviceServiceData): void {
    try {
      if (isUserDefinedState(deviceServiceData)) {
        this.updateLocalState(deviceServiceData.state);
        this.updateCharacteristics(this.getLocalState());
      }
    } catch (e) {
      this.setUnavailable();
    }
  }

  private async registerHandlers(): Promise<void> {
    this.log.info('Initializing accessory...');

    await this.syncAccessory();

    this.log.info('Starting periodic state updates...');
    this.startPeriodicStateSync();

    this.log.info('Registering characteristic handlers...');

    this.service.getCharacteristic(this.platform.Characteristic.On)
      .onGet(this.handleCurrentSwitchStateGet.bind(this))
      .onSet(this.handleCurrentSwitchStateSet.bind(this));
  }

  private async syncAccessory(): Promise<void> {
    this.log.info('Updating state...');

    return this.platform.queue.add(async () => {
      const deviceId = this.platformAccessory.context.id;

      try {
        (await this.platform.bshcApi.getUserDefinedState(deviceId))
          .forEach(data => {
            this.updateLocalState(data);
          });
      } catch (e) {
        this.log.warn('Could not fetch device state');
        this.setUnavailable();
        return;
      }

      this.updateCharacteristics(this.getLocalState());
    });
  }

  private startPeriodicStateSync(): void {
    const minutes = this.platform.config.stateSyncFrequency ??
      this.platform.config.stateUpdateFrequency ??
      this.platform.config.stateUpdates;

    if (minutes == null || minutes < 1) {
      this.log.info('Periodic updates are disabled');
      return;
    }

    this.timeoutId = setTimeout(async () => {
      this.log.debug('Running periodic state update...');

      try {
        await this.syncAccessory();
      } catch (e) {
        this.log.warn(`Could not update state during periodic update, retrying during next cycle in ${minutes} minutes`, e);
      }

      this.startPeriodicStateSync();
    }, minutes * 60 * 1000);
  }

  private stopPeriodicStateSync(): void {
    if (this.timeoutId == null) {
      return;
    }

    this.log.info('Stopping periodic state updates...');
    clearTimeout(this.timeoutId);
  }

  private updateLocalState(deviceServiceData: BoschUserDefinedState): void {
    this.state.available = true;

    this.log.debug(`Attempting to set local state from device service data ${deviceServiceData.id}...`);
    this.state.deviceState = deviceServiceData.state ? ON : OFF;
  }

  private updateCharacteristics(state: AccessoryState) {
    this.log.debug('Attempting to update characteristic with state...');
    this.log.debug(pretty(state));

    if (state.deviceState !== this.service.getCharacteristic(this.platform.Characteristic.On).value) {
      this.log.debug(`Updating user defined state switch to ${state.deviceState}...`);
      this.service.updateCharacteristic(this.platform.Characteristic.On, state.deviceState);
    }
  }

  private async handleCurrentSwitchStateGet(): Promise<SwitchState> {
    this.throwErrorIfUnavailable();

    this.log.debug(`Getting current state of ${this.platformAccessory.context.name}}...`);

    const state = this.getLocalState();
    return this.getCurrentSwitchState(state);
  }

  private async handleCurrentSwitchStateSet(value: CharacteristicValue): Promise<void> {
    this.state.deviceState = value as SwitchState;

    await this.platform.queue.add(async () => {
      this.throwErrorIfUnavailable();

      this.log.debug(`Setting target user defined state ${this.platformAccessory.context.name} to ${value}...`);

      try {
        await this.platform.bshcApi.setUserDefinedState(this.platformAccessory.context.id, this.state.deviceState);

      } catch (e) {
        this.throwHapStatusError(e as BshbError);
      }

    });
  }

  private getCurrentSwitchState(state: AccessoryState) {
    return state.deviceState === ON;
  }

  private throwErrorIfUnavailable() {
    if (this.state.available) {
      return;
    }

    this.log.warn('Accessory not available');

    throw new this.platform.api.hap.HapStatusError(
      HAPStatus.SERVICE_COMMUNICATION_FAILURE,
    );
  }

  private throwHapStatusError(error: BshbError): void {
    const e = error as BshbError;
    this.log.error(e.message);

    switch (e.errorType) {
      case BshbErrorType.TIMEOUT:
        throw new this.platform.api.hap.HapStatusError(
          HAPStatus.OPERATION_TIMED_OUT,
        );
      case BshbErrorType.PARSING:
        throw new this.platform.api.hap.HapStatusError(
          HAPStatus.INVALID_VALUE_IN_REQUEST,
        );
      default:
        throw new this.platform.api.hap.HapStatusError(
          HAPStatus.SERVICE_COMMUNICATION_FAILURE,
        );
    }
  }

  private get log(): Logger {
    const prefix = `[${this.platformAccessory.displayName}]`;

    const logger = (method: string) => {
      return (message: string, ...parameters: any[]) => {
        return this.platform.log[method](`${prefix} ${message}`, ...parameters);
      };
    };

    return {
      debug: logger('debug'),
      info: logger('info'),
      warn: logger('warn'),
      log: logger('log'),
      success: logger('success'),
      error: logger('error'),
      prefix: `${this.platform.log.prefix} ${prefix}`,
    };
  }
}
