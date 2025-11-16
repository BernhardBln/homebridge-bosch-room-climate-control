import {BoschServiceId} from "./BoschServiceId";

export type BoschUserDefinedState = {
    '@type': BoschServiceId.UserDefinedState;
    id: string;
    name: string;
    state: boolean;
};

export function isUserDefinedState(deviceServiceData: any)
  : deviceServiceData is BoschUserDefinedState {
    if (deviceServiceData["@type"] === BoschServiceId.UserDefinedState) {
        return true;
    }

    return false;
}