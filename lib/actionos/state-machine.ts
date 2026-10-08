import {
  type ActionSessionStatus,
} from "@/types/database";
import { ALLOWED_STATE_TRANSITIONS } from "@/types/actionos";

export class ActionStateMachineError extends Error {
  constructor(
    public readonly fromState: ActionSessionStatus,
    public readonly toState: ActionSessionStatus,
    message?: string
  ) {
    super(
      message ||
        `Illegal state transition: Cannot transition from '${fromState}' to '${toState}'.`
    );
    this.name = "ActionStateMachineError";
  }
}

export class ActionStateMachine {
  private _currentState: ActionSessionStatus;
  private readonly _history: Array<{
    state: ActionSessionStatus;
    timestamp: string;
    reason?: string;
  }> = [];

  constructor(initialState: ActionSessionStatus = "received") {
    this._currentState = initialState;
    this._history.push({
      state: initialState,
      timestamp: new Date().toISOString(),
    });
  }

  get currentState(): ActionSessionStatus {
    return this._currentState;
  }

  get history() {
    return [...this._history];
  }

  /**
   * Check if transition is valid without mutating state.
   */
  canTransitionTo(nextState: ActionSessionStatus): boolean {
    const allowed = ALLOWED_STATE_TRANSITIONS[this._currentState] || [];
    return allowed.includes(nextState);
  }

  /**
   * Transition state. Throws ActionStateMachineError on illegal transition.
   */
  transition(nextState: ActionSessionStatus, reason?: string): ActionSessionStatus {
    if (!this.canTransitionTo(nextState)) {
      throw new ActionStateMachineError(this._currentState, nextState);
    }

    this._currentState = nextState;
    this._history.push({
      state: nextState,
      timestamp: new Date().toISOString(),
      reason,
    });

    return this._currentState;
  }
}
