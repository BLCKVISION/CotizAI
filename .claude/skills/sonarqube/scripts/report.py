"""Prints the measures, security issues and hotspots of the last analysis."""

import json, sys, time, base64, urllib.request, urllib.parse
H, token = "http://127.0.0.1:19999", open(sys.argv[1]).read()
def get(path, **q):
    req = urllib.request.Request(H + path + "?" + urllib.parse.urlencode(q), headers={"Authorization": "Basic " + base64.b64encode((token + ":").encode()).decode()})
    return json.load(urllib.request.urlopen(req, timeout=60))
for _ in range(60):
    t = get("/api/ce/component", component="cotizai")
    if not t.get("queue") and t.get("current", {}).get("status") in ("SUCCESS", "FAILED"): break
    time.sleep(3)
print("processing:", t["current"]["status"])
keys = ["ncloc", "vulnerabilities", "security_rating", "software_quality_security_issues", "software_quality_security_rating",
        "software_quality_security_remediation_effort", "security_remediation_effort", "security_hotspots", "security_review_rating",
        "bugs", "reliability_rating", "code_smells", "sqale_rating"]
m = {x["metric"]: x.get("value") for x in get("/api/measures/component", component="cotizai", metricKeys=",".join(keys))["component"]["measures"]}
LETTERS = {"1.0": "A", "2.0": "B", "3.0": "C", "4.0": "D", "5.0": "E"}
for k in keys: print(f"  {k}: {LETTERS.get(m.get(k), m.get(k, '-')) if k.endswith('rating') else m.get(k, '-')}")
print("quality gate:", get("/api/qualitygates/project_status", projectKey="cotizai")["projectStatus"]["status"])
print("\n== security issues (open)")
r = get("/api/issues/search", componentKeys="cotizai", impactSoftwareQualities="SECURITY", issueStatuses="OPEN,CONFIRMED", ps=500)
print("total:", r["total"])
for i in r["issues"]:
    sev = next((x["severity"] for x in i.get("impacts", []) if x["softwareQuality"] == "SECURITY"), i.get("severity"))
    print(f"  {sev:8} {i['rule']:22} {i['component'].split(':',1)[1]}:{i.get('line','-')} | {i['message'][:110]}")
print("\n== security hotspots to review")
h = get("/api/hotspots/search", project="cotizai", ps=500)
print("total:", h["paging"]["total"])
for x in h["hotspots"]:
    print(f"  {x['vulnerabilityProbability']:6} {x['ruleKey']:22} {x['component'].split(':',1)[1]}:{x.get('line','-')} | {x['message'][:100]}")
