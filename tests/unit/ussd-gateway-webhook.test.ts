import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { POST } from "@/app/api/webhooks/ussd/route";

describe("ActionOS USSD Feature Phone Gateway (*384*2026#) Test Suite", () => {
  it("should return root USSD menu when text is empty", async () => {
    const req = new Request("http://localhost:3000/api/webhooks/ussd", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sessionId: "sess_001",
        serviceCode: "*384*2026#",
        phoneNumber: "+2348031234567",
        text: "",
      }),
    });

    const res = await POST(req);
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.shouldClose, false);
    assert.ok(data.raw.startsWith("CON "));
    assert.ok(data.response.includes("ActionOS Trust Core"));
    assert.ok(data.response.includes("1. Quick Vehicle License & Insurance"));
    assert.ok(data.response.includes("2. Roadworthiness & LASDRI Check"));
  });

  it("should prompt for vehicle plate when user selects Option 1", async () => {
    const req = new Request("http://localhost:3000/api/webhooks/ussd", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sessionId: "sess_001",
        serviceCode: "*384*2026#",
        phoneNumber: "+2348031234567",
        text: "1",
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    assert.equal(data.shouldClose, false);
    assert.ok(data.raw.startsWith("CON "));
    assert.ok(data.response.includes("Enter Vehicle Plate Number"));
  });

  it("should calculate and return statutory quote for commercial Danfo bus plate", async () => {
    const req = new Request("http://localhost:3000/api/webhooks/ussd", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sessionId: "sess_001",
        serviceCode: "*384*2026#",
        phoneNumber: "+2348031234567",
        text: "1*ABC-123-XY",
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    assert.equal(data.shouldClose, false);
    assert.ok(data.raw.startsWith("CON "));
    assert.ok(data.response.includes("ActionOS Quote for ABC-123-XY:"));
    assert.ok(data.response.includes("NGN 26,000"));
    assert.ok(data.response.includes("1. Authorize Debit (Saved NIP Wallet)"));
  });

  it("should prompt for 4-digit PIN when user chooses to authorize debit", async () => {
    const req = new Request("http://localhost:3000/api/webhooks/ussd", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sessionId: "sess_001",
        serviceCode: "*384*2026#",
        phoneNumber: "+2348031234567",
        text: "1*ABC-123-XY*1",
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    assert.equal(data.shouldClose, false);
    assert.ok(data.raw.startsWith("CON "));
    assert.ok(data.response.includes("Enter 4-digit ActionOS Security PIN"));
  });

  it("should execute renewal and send SMS receipt upon valid 4-digit PIN input", async () => {
    const req = new Request("http://localhost:3000/api/webhooks/ussd", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sessionId: "sess_001",
        serviceCode: "*384*2026#",
        phoneNumber: "+2348031234567",
        text: "1*ABC-123-XY*1*1234",
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    assert.equal(data.shouldClose, true);
    assert.ok(data.raw.startsWith("END "));
    assert.ok(data.response.includes("Renewal Successful!"));
    assert.ok(data.response.includes("ABC-123-XY"));
    assert.ok(data.response.includes("ACT-USSD-"));
    assert.ok(data.response.includes("Digital e-Badge & SMS verification link sent to +2348031234567"));
  });

  it("should handle cancellation when user inputs 0", async () => {
    const req = new Request("http://localhost:3000/api/webhooks/ussd", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sessionId: "sess_001",
        serviceCode: "*384*2026#",
        phoneNumber: "+2348031234567",
        text: "1*ABC-123-XY*0",
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    assert.equal(data.shouldClose, true);
    assert.ok(data.raw.startsWith("END "));
    assert.ok(data.response.includes("Renewal cancelled. No debit occurred."));
  });

  it("should return virtual bank account transfer details for choice 2", async () => {
    const req = new Request("http://localhost:3000/api/webhooks/ussd", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sessionId: "sess_001",
        serviceCode: "*384*2026#",
        phoneNumber: "+2348031234567",
        text: "1*ABC-123-XY*2",
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    assert.equal(data.shouldClose, true);
    assert.ok(data.raw.startsWith("END "));
    assert.ok(data.response.includes("Wema Bank"));
    assert.ok(data.response.includes("Acct: 9920264567"));
  });

  it("should handle Option 2: Roadworthiness LACVIS inspection query", async () => {
    const req = new Request("http://localhost:3000/api/webhooks/ussd", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sessionId: "sess_001",
        serviceCode: "*384*2026#",
        phoneNumber: "+2348031234567",
        text: "2*ABC-123-XY",
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    assert.equal(data.shouldClose, true);
    assert.ok(data.raw.startsWith("END "));
    assert.ok(data.response.includes("LACVIS Inspection"));
    assert.ok(data.response.includes("PASSED"));
    assert.ok(data.response.includes("Brakes: 84%"));
  });

  it("should handle Option 3: Stolen vehicle alert detection", async () => {
    const req = new Request("http://localhost:3000/api/webhooks/ussd", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        sessionId: "sess_001",
        serviceCode: "*384*2026#",
        phoneNumber: "+2348031234567",
        text: "3*STOLEN-999-XX",
      }),
    });

    const res = await POST(req);
    const data = await res.json();

    assert.equal(data.shouldClose, true);
    assert.ok(data.raw.startsWith("END "));
    assert.ok(data.response.includes("ALERT: STOLEN VEHICLE DETECTED!"));
  });

  it("should accept standard Africa's Talking urlencoded form-data payload", async () => {
    const formData = new FormData();
    formData.append("sessionId", "telco_session_999");
    formData.append("serviceCode", "*384*2026#");
    formData.append("phoneNumber", "+2348031234567");
    formData.append("text", "4");

    const req = new Request("http://localhost:3000/api/webhooks/ussd", {
      method: "POST",
      body: formData,
    });

    const res = await POST(req);
    assert.equal(res.status, 200);
    const rawText = await res.text();

    assert.ok(rawText.startsWith("END "));
    assert.ok(rawText.includes("Active Policies"));
  });
});
