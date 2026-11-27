import { describe, expect, it } from "vitest";
import { upsertCustomer } from "../src/lib/db";
import { deliveryAddress } from "../src/lib/mail-to";

/** 10-30: a reading bought while signed in is mailed to the account, not to the address typed into Stripe's form (gmail.clm bounced). */
describe("where the reading letter goes", () => {
  it("signed in: the account's address; nobody signed in: the order's", () => {
    const cid = upsertCustomer("mailto-a@gmail.com", "zh-hant");
    expect(deliveryAddress({ email: "mailto-a@gmail.clm", customerId: cid })).toBe("mailto-a@gmail.com");
    expect(deliveryAddress({ email: "mailto-a@gmail.com", customerId: cid })).toBe("mailto-a@gmail.com");
    expect(deliveryAddress({ email: "someone@example.com", customerId: null })).toBe("someone@example.com");
    expect(deliveryAddress({ email: null, customerId: null })).toBeNull();
    expect(deliveryAddress({ email: "x@example.com", customerId: 99999999 })).toBe("x@example.com"); // no such account
  });
});
