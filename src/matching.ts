// Calcula qué tan bien matchea un Lead con una Property (reglas simples, sin ML).
export function scoreMatch(lead: any, property: any): number {
  let score = 0;

  if (lead.zone.toLowerCase() === property.zone.toLowerCase()) score += 40;
  if (lead.operationType === property.operationType) score += 30;
  if (lead.propertyType === property.propertyType) score += 20;

  const price = Number(property.price);
  const min = lead.budgetMin ? Number(lead.budgetMin) : null;
  const max = lead.budgetMax ? Number(lead.budgetMax) : null;
  if (min !== null && max !== null && price >= min && price <= max) score += 10;

  return score;
}