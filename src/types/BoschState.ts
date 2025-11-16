import { BoschClimateControlState } from './BoschClimateControlState';
import { BoschTemperatureLevelState } from './BoschTemperatureLevelState';
import {BoschUserDefinedState} from "./BoschUserDefinedState";

export type BoschState = BoschClimateControlState | BoschTemperatureLevelState | BoschUserDefinedState;