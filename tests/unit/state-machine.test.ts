import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ActionStateMachine, ActionStateMachineError } from "@/lib/actionos/state-machine";

describe("ActionStateMachine", () => {
  it("should initialize in received state", () => {
    const sm = new ActionStateMachine("received");
    assert.equal(sm.currentState, "received");
  });

  it("should permit legal forward transitions", () => {
    const sm = new ActionStateMachine("received");
    sm.transition("understanding");
    assert.equal(sm.currentState, "understanding");

    sm.transition("planning");
    assert.equal(sm.currentState, "planning");

    sm.transition("validating");
    assert.equal(sm.currentState, "validating");

    sm.transition("awaiting_authorization");
    assert.equal(sm.currentState, "awaiting_authorization");

    sm.transition("executing");
    assert.equal(sm.currentState, "executing");

    sm.transition("verifying");
    assert.equal(sm.currentState, "verifying");

    sm.transition("completed");
    assert.equal(sm.currentState, "completed");
  });

  it("should reject arbitrary illegal state transitions", () => {
    const sm = new ActionStateMachine("received");
    // Cannot jump from received straight to completed
    assert.throws(
      () => {
        sm.transition("completed");
      },
      (err: Error) => {
        return err instanceof ActionStateMachineError;
      }
    );
  });

  it("should permit escalation from failure", () => {
    const sm = new ActionStateMachine("understanding");
    sm.transition("failed");
    assert.equal(sm.currentState, "failed");

    sm.transition("escalated");
    assert.equal(sm.currentState, "escalated");
  });
});
