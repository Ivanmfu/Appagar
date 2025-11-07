export function splitEvenlyInCents(totalCents: number, n: number): number[] {
  const base = Math.floor(totalCents / n);
  const resto = totalCents % n;
  const res = Array(n).fill(base);
  for (let i = 0; i < resto; i++) res[i] += 1;
  return res;
}

type Net = { userId: string; net: number }; // net en céntimos (positivo cobra, negativo debe)
export function simplifyDebts(nets: Net[]) {
  const debtors = [...nets].filter(n => n.net < 0).map(d => ({ id: d.userId, amt: -d.net })).sort((a,b)=>b.amt-a.amt);
  const creditors = [...nets].filter(n => n.net > 0).map(c => ({ id: c.userId, amt: c.net })).sort((a,b)=>b.amt-a.amt);
  const tx: { from: string; to: string; amount: number }[] = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt);
    if (pay > 0) tx.push({ from: debtors[i].id, to: creditors[j].id, amount: pay });
    debtors[i].amt -= pay;
    creditors[j].amt -= pay;
    if (debtors[i].amt === 0) i++;
    if (creditors[j].amt === 0) j++;
  }
  return tx;
}
