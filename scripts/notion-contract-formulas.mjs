// Reproducible Notion formulas for the CS contract. No credentials, API calls,
// payroll execution, or automatic writes. Dates use fixed Brasília UTC-3.
// A business day is the next eligible date at the same time; onboarding counts
// whole eligible dates after the normalized receipt date. Good Friday follows
// the annual federal calendar. Carnival/Corpus Christi are not national holidays.
const DAY = 86400000;
const HOUR = 3600000;
const opening = t => `floor((${t}-10800000)/${DAY})*${DAY}+43200000`;
const workday = d => `lets(cd,${d},cy,year(cd),ca,mod(cy,19),cb,floor(cy/100),cc,mod(cy,100),ce,floor(cb/4),cf,mod(cb,4),cg,floor((cb+8)/25),ch,floor((cb-cg+1)/3),ci,mod(19*ca+cb-ce-ch+15,30),cj,floor(cc/4),ck,mod(cc,4),cl,mod(32+2*cf+2*cj-ci-ck,7),cm,floor((ca+11*ci+22*cl)/451),cn,floor((ci+cl-7*cm+114)/31),cp,mod(ci+cl-7*cm+114,31)+1,ceaster,timestamp(parseDate(format(cy)+"-"+if(cn<10,"0","")+format(cn)+"-"+if(cp<10,"0","")+format(cp)+"T12:00:00Z")),mod(floor((timestamp(cd)-43200000)/${DAY})+3,7)<5 and not includes(["01-01","04-21","05-01","09-07","10-12","11-02","11-15","11-20","12-25"],formatDate(cd,"MM-DD")) and timestamp(cd)!=ceaster-2*${DAY})`;
const days = (base, n=40) => `repeat("x",${n}).split("").map(fromTimestamp(${base}+index*${DAY})).filter(${workday("current")})`;
const normalize = d => `lets(rt,timestamp(${d}),rb,${opening("rt")},rd,${days("rb",12)}.filter(timestamp(current)+9*${HOUR}>rt),fromTimestamp(max(rt,timestamp(first(rd)))))`;
const next = s => `lets(ns,timestamp(${s}),nb,${opening("ns")},nd,${days("nb+86400000",12)},fromTimestamp(timestamp(first(nd))+ns-nb))`;
const addHours = (s,h) => `lets(ht,timestamp(${s}),hb,${opening("ht")},leftToday,hb+9*${HOUR}-ht,if(leftToday>=${h*HOUR},fromTimestamp(ht+${h*HOUR}),fromTimestamp(timestamp(first(${days("hb+86400000",12)}))+${h*HOUR}-leftToday)))`;
const p = name => `prop(${JSON.stringify(name)})`;
const input = `if(empty(${p("Recebido em")}),${p("Data de entrada")},${p("Recebido em")})`;
const event = `if(empty(${p("Encaminhado em")}),${p("Data de conclusão")},if(empty(${p("Data de conclusão")}),${p("Encaminhado em")},fromTimestamp(min(timestamp(${p("Encaminhado em")}),timestamp(${p("Data de conclusão")})))))`;
const result = (actual,due) => `if(${p("Status")}=="Cancelada","Cancelada",if(not empty(${actual}),if(timestamp(${actual})<=timestamp(${due}),"No prazo","Atrasado"),if(${p("Status")}=="Concluída","Sem registro",if(now()>${due},"Atrasado","Pendente"))))`;
export const demandFormulas = {
  "Início SLA útil (auto)": normalize(input),
  "Prazo 1ª resposta útil (auto)": addHours(p("Início SLA útil (auto)"),4),
  "Prazo solução útil (auto)": next(p("Início SLA útil (auto)")),
  // A manual delivery date remains intact; it never extends the contractual
  // response/forwarding deadline, which has its own independent result.
  "Prazo final efetivo (útil)": `if(empty(${p("Prazo final")}),${p("Prazo solução útil (auto)")},${p("Prazo final")})`,
  "SLA 1ª resposta": result(p("Primeira resposta em"),p("Prazo 1ª resposta útil (auto)")),
  "SLA solução ou encaminhamento": result(event,p("Prazo solução útil (auto)")),
  "Prazo 1ª resposta (auto)": p("Prazo 1ª resposta útil (auto)"),
  "Prazo solução/encaminhamento (auto)": p("Prazo solução útil (auto)"),
  "Prazo SLA por tipo (auto)": p("Prazo solução útil (auto)"),
  "Regra SLA por tipo (auto)": `if(${p("Classificação")}=="Onboarding","Onboarding: 5–15 dias úteis após informações completas",if(${p("Classificação")}=="Pequena melhoria","Preferência: mesmo dia útil; resposta e encaminhamento mantêm SLA","1ª resposta: 4h úteis; solução ou encaminhamento: 1 dia útil"))`,
};
// Counts working time only; overdue values are negative. Extremely old dates
// are bounded at 3660 days to avoid excessive formula cost, without hiding delay.
demandFormulas["Horas restantes úteis (referência)"] = `lets(hf,timestamp(${p("Prazo final efetivo (útil)")}),he,fromTimestamp(min(hf,if(${p("SLA 1ª resposta")}=="Pendente",timestamp(${p("Prazo 1ª resposta útil (auto)")}),hf),if(${p("SLA solução ou encaminhamento")}=="Pendente",timestamp(${p("Prazo solução útil (auto)")}),hf))),ha,min(timestamp(now()),timestamp(he)),hz,max(timestamp(now()),timestamp(he)),hd,${opening("ha")},hn,min(3660,ceil((hz-hd)/${DAY})+1),hv,${days("hd","hn")}.map(max(0,min(hz,timestamp(current)+9*${HOUR})-max(ha,timestamp(current)))).sum()/${HOUR},if(timestamp(he)<timestamp(now()),-hv,hv))`;
demandFormulas["Status SLA útil (auto)"] = `ifs(${p("Status")}=="Cancelada","Cancelada",${p("Status")}=="Concluída","Concluída",${p("SLA 1ª resposta")}=="Atrasado" or ${p("SLA solução ou encaminhamento")}=="Atrasado","Atrasado",not empty(${p("Prazo final")}) and now()>${p("Prazo final")},"Atrasado",${p("SLA 1ª resposta")}=="No prazo" and ${p("SLA solução ou encaminhamento")}=="No prazo" and empty(${p("Prazo final")}),"SLA cumprido",${p("Horas restantes úteis (referência)")}<=2,"Próximo do vencimento","Dentro do prazo")`;
demandFormulas["Status SLA automático"] = p("Status SLA útil (auto)");
demandFormulas["Horas restantes (auto)"] = p("Horas restantes úteis (referência)");
const info=p("Informações completas em");
const onboardingDue = n => `if(empty(${info}),parseDate(""),lets(ot,timestamp(${normalize(info)}),ob,${opening("ot")},od,${days("ob",50)},fromTimestamp(timestamp(od.at(${n}))+9*${HOUR})))`;
export const onboardingFormulas = {
  "Marco 5 dias úteis": onboardingDue(5),
  "Limite 15 dias úteis": onboardingDue(15),
  "Status do prazo": `ifs(empty(${info}),"Aguardando dados completos",${p("Status")}=="Concluído" and empty(${p("Concluído em")}),"Sem registro de conclusão",${p("Status")}=="Concluído",if(${p("Concluído em")}>${p("Limite 15 dias úteis")},"Concluído com atraso","Concluído no prazo"),now()>${p("Limite 15 dias úteis")},"Atrasado",not empty(${p("Data prevista")}) and now()>dateAdd(${p("Data prevista")},1,"days"),"Prazo combinado vencido",now()>${p("Marco 5 dias úteis")},"Em execução (5–15 dias úteis)","Dentro do prazo")`,
};
export const upgradeFormulas = {
  "Comissão prevista (auto)": `if(${p("Comissão contratual aplicável")} and not empty(${p("Responsável")}) and ${p("Novo valor")}>${p("Valor atual")} and ${p("Status")}!="Perdido",round(${p("Novo valor")}*100)/100,0)`,
  "Comissão devida": `if(${p("Status")}=="Efetivado" and not empty(${p("Data de aceite")}) and not empty(${p("Data de efetivação")}),${p("Comissão prevista (auto)")},0)`,
  "Competência": `if(${p("Comissão devida")}>0,formatDate(${p("Data de efetivação")},"YYYY-MM"),"")`,
  "Pagamento previsto": `if(${p("Comissão devida")}>0,parseDate(formatDate(dateAdd(${p("Data de efetivação")},1,"months"),"YYYY-MM")+"-10"),parseDate(""))`,
};
// Supply the contracted employee's verified Notion email at configuration time;
// do not assume another employee has the same remuneration terms.
export const eligibilityFormula = email => `${p("Responsável")}.map(email(current)).includes(${JSON.stringify(email)})`;
export const ddl = (formulas, existing=[]) => Object.entries(formulas).map(([name,expr]) =>
  `${existing.includes(name)?"ALTER":"ADD"} COLUMN ${JSON.stringify(name)} ${existing.includes(name)?"SET ":""}FORMULA('${expr.replaceAll("'","''")}')`
).join("; ");
if (process.argv[1]?.endsWith("notion-contract-formulas.mjs")) console.log(JSON.stringify({demandFormulas,onboardingFormulas,upgradeFormulas}));
