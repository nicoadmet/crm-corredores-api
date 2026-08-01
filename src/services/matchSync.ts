// Mantiene los Match sincronizados cada vez que cambia un Lead o una Property:
// recalcula el score contra todos los activos del otro lado y guarda o borra según corresponda.
import { matchDetails } from "./matching";

const MATCH_THRESHOLD = 50;

async function upsertOrDropMatch(tx: any, accountId: string, lead: any, property: any) {
  const { score } = matchDetails(lead, property);
  if (score >= MATCH_THRESHOLD) {
    await tx.match.upsert({
      where: { leadId_propertyId: { leadId: lead.id, propertyId: property.id } },
      update: { score },
      create: { accountId, leadId: lead.id, propertyId: property.id, score },
    });
  } else {
    await tx.match.deleteMany({
      where: { leadId: lead.id, propertyId: property.id },
    });
  }
}

export async function syncMatchesForLead(tx: any, accountId: string, lead: any) {
  const properties = await tx.property.findMany({ where: { accountId, deletedAt: null } });
  for (const property of properties) {
    await upsertOrDropMatch(tx, accountId, lead, property);
  }
}

export async function syncMatchesForProperty(tx: any, accountId: string, property: any) {
  const leads = await tx.lead.findMany({ where: { accountId, deletedAt: null } });
  for (const lead of leads) {
    await upsertOrDropMatch(tx, accountId, lead, property);
  }
}

export async function deleteMatchesForLead(tx: any, leadId: string) {
  await tx.match.deleteMany({ where: { leadId } });
}

export async function deleteMatchesForProperty(tx: any, propertyId: string) {
  await tx.match.deleteMany({ where: { propertyId } });
}
