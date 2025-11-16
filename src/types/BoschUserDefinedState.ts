import {BoschServiceId} from "./BoschServiceId";

export type BoschUserDefinedState = {
    '@type': BoschServiceId.UserDefinedState;
    id: string;
    name: string;
    state: boolean;
};