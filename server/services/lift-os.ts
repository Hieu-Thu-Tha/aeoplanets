const LIFT_OS_BASE_URL = "https://lift-os.com/api/v1";
const REQUEST_TIMEOUT_MS = 10000;
const PIPELINE_ID = 2;
const STAGE_ID = 6;

function getApiKey(): string | null {
  return process.env.LIFT_OS_API_KEY ?? null;
}

function createAbortController(): { controller: AbortController; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  return { controller, clear: () => clearTimeout(timer) };
}

async function liftFetch(path: string, body: Record<string, any>): Promise<any> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.warn("[Lift-OS] LIFT_OS_API_KEY not set — skipping");
    return null;
  }

  const { controller, clear } = createAbortController();
  try {
    const response = await fetch(`${LIFT_OS_BASE_URL}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[Lift-OS] POST ${path} failed (${response.status}):`, errorBody);
      return null;
    }

    const result = await response.json();
    return result.data ?? null;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      console.error(`[Lift-OS] Request to ${path} timed out`);
    } else {
      console.error(`[Lift-OS] Error posting to ${path}:`, error);
    }
    return null;
  } finally {
    clear();
  }
}

export async function sendTrialLeadToLiftOS(user: {
  firstName: string;
  lastName: string;
  email: string;
}): Promise<void> {
  const lead = await liftFetch("/leads", {
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    source: "website",
    sourceChannel: "free_trial_signup",
    summary: `New AEOSTARS free trial signup: ${user.firstName} ${user.lastName} (${user.email})`,
    status: "prospect",
    intent: "purchase",
    urgency: "medium",
  });

  if (lead) {
    console.log(`[Lift-OS] Lead created for ${user.email} — ID: ${lead.id ?? "unknown"}`);
  }
}

interface DealInput {
  firstName: string;
  lastName: string;
  email: string;
  telephone: string;
  companyName: string;
  billingAddress: string;
  planName: string;
  billingInterval: string;
  planPrice: string;
  planFeatures: string[];
}

export async function createDealInLiftOS(input: DealInput): Promise<{ dealId?: number } | null> {
  if (!getApiKey()) {
    console.warn("[Lift-OS] LIFT_OS_API_KEY not set — skipping deal creation");
    return null;
  }

  const contact = await liftFetch("/contacts", {
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.telephone || undefined,
  });
  const contactId = contact?.id ?? null;
  console.log(`[Lift-OS] Contact ${contactId ? `created (ID: ${contactId})` : "creation skipped"}`);

  const company = await liftFetch("/companies", {
    name: input.companyName,
  });
  const companyId = company?.id ?? null;
  console.log(`[Lift-OS] Company ${companyId ? `created (ID: ${companyId})` : "creation skipped"}`);

  const priceNum = parseFloat(input.planPrice.replace(/[^0-9.]/g, "")) || 0;

  const notesContent = [
    `Plan: ${input.planName} (${input.billingInterval})`,
    `Price: ${input.planPrice}`,
    `Telephone: ${input.telephone || "Not provided"}`,
    `Billing Address: ${input.billingAddress || "Not provided"}`,
    "",
    "Package Features:",
    ...input.planFeatures.map((f) => `  - ${f}`),
  ].join("\n");

  const deal = await liftFetch("/deals", {
    title: `${input.companyName} — ${input.planName} ${input.billingInterval}`,
    value: priceNum,
    currency: "GBP",
    pipelineId: PIPELINE_ID,
    stageId: STAGE_ID,
    contactId,
    companyId,
    status: "open",
    notes: notesContent,
  });

  if (deal) {
    console.log(`[Lift-OS] Deal created for ${input.companyName} — ID: ${deal.id}, Value: £${priceNum}`);
    return { dealId: deal.id };
  }

  console.error(`[Lift-OS] Deal creation failed for ${input.companyName}`);
  return null;
}
