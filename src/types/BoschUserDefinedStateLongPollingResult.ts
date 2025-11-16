import {BoschServiceId} from './BoschServiceId';

export type BoschUserDefinedStateLongPollingResult =  {
  '@type': BoschServiceId.UserDefinedState;
  id: string;
  // not set when deleted
  name?: string;
  state?: boolean;
  deleted: boolean;
};

export function isUserDefinedStateLongPollingResult(longPollingResult: any)
  : longPollingResult is BoschUserDefinedStateLongPollingResult {
  if (longPollingResult['@type'] === BoschServiceId.UserDefinedState
    && 'deleted' in longPollingResult) {
    return true;
  }

  return false;
}