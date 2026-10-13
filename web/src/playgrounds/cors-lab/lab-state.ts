/** The lab's state: the settings, the scenario they came from and how many steps are shown. */
import {
  scenarios,
  type RequestSettings,
  type ScenarioId,
  type ServerSettings,
  type Settings,
} from './cors';

export interface LabState {
  /** 'custom' once the reader changes a control by hand. */
  scenario: ScenarioId | 'custom';
  settings: Settings;
  /** How many steps of the run are shown. It may go past the end: the interface stops there. */
  shown: number;
}

export type LabAction =
  | { type: 'scenario'; id: ScenarioId }
  | { type: 'request'; patch: Partial<RequestSettings> }
  | { type: 'server'; patch: Partial<ServerSettings> }
  | { type: 'step' }
  | { type: 'all' }
  | { type: 'reset' };

/** Enough for any run: the longest has nine steps. */
const everything = 99;

export function initialState(id: ScenarioId = 'usual-error'): LabState {
  return { scenario: id, settings: scenarios[id], shown: 1 };
}

/** Changing anything starts the run again, from the page's `fetch`. */
export function reduce(state: LabState, action: LabAction): LabState {
  switch (action.type) {
    case 'scenario':
      return initialState(action.id);
    case 'request':
      return {
        scenario: 'custom',
        settings: { ...state.settings, request: { ...state.settings.request, ...action.patch } },
        shown: 1,
      };
    case 'server':
      return {
        scenario: 'custom',
        settings: { ...state.settings, server: { ...state.settings.server, ...action.patch } },
        shown: 1,
      };
    case 'step':
      return { ...state, shown: state.shown + 1 };
    case 'all':
      return { ...state, shown: everything };
    case 'reset':
      return { ...state, shown: 1 };
  }
}
