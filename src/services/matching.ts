// Calcula qué tan bien matchea un Lead con una Property (reglas simples, sin ML) y por qué.
export function matchDetails(lead: any, property: any): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  const zoneMatch = lead.zones.some(
    (zone: string) => zone.toLowerCase() === property.zone.toLowerCase()
  );
  if (zoneMatch) {
    score += 40;
    reasons.push("Misma zona");
  }

  if (lead.operationType === property.operationType) {
    score += 30;
    reasons.push("Mismo tipo de operación");
  }

  if (lead.propertyType === property.propertyType) {
    score += 20;
    reasons.push("Mismo tipo de propiedad");
  }

  const price = Number(property.price);
  const min = lead.budgetMin != null ? Number(lead.budgetMin) : null;
  const max = lead.budgetMax != null ? Number(lead.budgetMax) : null;
  if (min !== null && max !== null) {
    if (price >= min && price <= max) {
      score += 10;
      reasons.push("Presupuesto dentro de rango");
    } else {
      const tolerance = 0.15;
      if (price >= min * (1 - tolerance) && price <= max * (1 + tolerance)) {
        score += 5;
        reasons.push("Presupuesto cerca del rango (±15%)");
      }
    }
  }

  if (lead.minRooms != null && property.rooms != null && property.rooms >= lead.minRooms) {
    score += 5;
    reasons.push("Cumple ambientes mínimos");
  }

  if (lead.minBathrooms != null && property.bathrooms != null && property.bathrooms >= lead.minBathrooms) {
    score += 5;
    reasons.push("Cumple baños mínimos");
  }

  if (lead.needsGarage && property.garage) {
    score += 5;
    reasons.push("Tiene cochera");
  }

  return { score, reasons };
}
