let feeds = [];
let reqTable = [];
let pastData = {};

const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwYJMZUYjelpVKD9Cx3cjwB21juq0US2RJKfTdTqa4fda65jcuVD-6IeodXbys6gPmIag/exec";

async function initApp() {
  try {
    const response = await fetch(WEB_APP_URL);
    const text = await response.text();
    
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error("GASからJSON以外のデータが返されました。デプロイ設定やURLを確認してください。\nレスポンス: " + text.substring(0, 100));
    }
    
    const rawFeeds = data.feeds || [];
    feeds = rawFeeds.map(f => ({
      ...f,
      エネルギー: parseFloat(f.エネルギー) || 0,
      タンパク質: parseFloat(f.タンパク質) || 0,
      Lys: parseFloat(f.Lys) || 0,
      Ca: parseFloat(f.Ca) || 0,
      P: parseFloat(f.P) || 0,
      Mg: parseFloat(f.Mg) || 0,
      Na: parseFloat(f.Na) || 0,
      K: parseFloat(f.K) || 0,
      Fe: parseFloat(f.Fe) || 0,
      Cu: parseFloat(f.Cu) || 0,
      Zn: parseFloat(f.Zn) || 0,
      Mn: parseFloat(f.Mn) || 0,
      Se: parseFloat(f.Se) || 0,
      Co: parseFloat(f.Co) || 0,
      VA: parseFloat(f.VA) || 0,
      VD: parseFloat(f.VD) || 0,
      VE: parseFloat(f.VE) || 0
    }));
pastData = data.pastData || {};
console.log("GASから取得したdata:", data);
console.log("GASから取得したreqTable:", data.reqTable);
console.log("GASから取得したpastData:", pastData);
const rawReq = data.reqTable || [];
    reqTable = rawReq.map(r => {
      let obj = {};
      for (const key in r) {
        obj[key] = (key === "weight" || key === "work") ? r[key] : parseFloat(r[key]) || 0;
      }
      return obj;
    });

    createRows();
    calculate();
    
    document.getElementById("reset-btn").addEventListener("click", resetInputs);
    document.getElementById("save-btn").addEventListener("click", saveDataToSpreadsheet);
    document.getElementById("weight").addEventListener("change", calculate);
    document.getElementById("work").addEventListener("change", calculate);

  } catch (error) {
    console.error("スプレッドシートデータの読み込みに失敗しました:", error);
    alert("エラーが発生しました:\n" + error.message);
  }
}

window.addEventListener("DOMContentLoaded", initApp);


const units = { エネルギー: "Mcal", タンパク質: "g", Lys: "g", Ca: "g", P: "g", Mg: "g", Na: "g", K: "g", Fe: "mg", Cu: "mg", Zn: "mg", Mn: "mg", Se: "mg", Co: "mg", VA: "IU", VD: "IU", VE: "IU" };

function getRequirements(weight, work) {
  console.log("=== 要求量検索 ===");
  console.log("weight:", weight);
  console.log("work:", work);
  console.log("reqTable:", reqTable);

  if (!reqTable || reqTable.length === 0) {
    console.error("reqTableが空です！");
    return null;
  }

  const result = reqTable.find(r =>
    Number(r.weight) === Number(weight) &&
    String(r.work).trim() === String(work).trim()
  );

  if (!result) {
    console.warn("該当する要求量データがありません:", weight, work);
    console.warn("reqTable:", reqTable);
    return reqTable[0];
  }

  return result;
}

function createRows() {
  const feedBody = document.getElementById("feed-body");
  feedBody.innerHTML = "";
  feeds.forEach(f => {
    const isCupFeed = f.name === "塩";
    const unit = isCupFeed ? "杯" : "kg";
    const step = isCupFeed ? "1" : "0.1";
    const def1 = isCupFeed ? (f.default1 ? (parseFloat(f.default1) * 100).toFixed(0) : "") : f.default1;
    const def2 = isCupFeed ? (f.default2 ? (parseFloat(f.default2) * 100).toFixed(0) : "") : f.default2;

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${f.name}</td>
      <td><nobr><input type="number" class="feed-amount1" value="${def1}" step="${step}" min="0">${unit}</nobr></td>
      <td><nobr><input type="number" class="feed-amount2" value="${def2}" step="${step}" min="0">${unit}</nobr></td>
      <td><nobr><input type="number" class="feed-total" value="0" readonly>${unit}</nobr></td>
      <td class="past-text"><span class="past-amount1">-</span></td>
      <td class="past-text"><span class="past-amount2">-</span></td>
    `;
    feedBody.appendChild(row);

    const input1 = row.querySelector(".feed-amount1");
    const input2 = row.querySelector(".feed-amount2");
    const total = row.querySelector(".feed-total");

    function updateTotal() {
      let val1 = parseFloat(input1.value || 0);
      let val2 = parseFloat(input2.value || 0);
      if (isCupFeed) {
        total.value = ((val1 + val2) * 2).toFixed(0);
      } else {
        total.value = ((val1 + val2) * 2).toFixed(1);
      }
      calculate();
    }

    input1.addEventListener("input", updateTotal);
    input2.addEventListener("input", updateTotal);
    updateTotal();
  });
}

function calculate() {
  const weightSelect = document.getElementById("weight");
  if (!weightSelect || weightSelect.selectedIndex === -1) return;
  const horseName = weightSelect.options[weightSelect.selectedIndex].text;
  const workVal = document.getElementById("work").value;
  const weightVal = document.getElementById("weight").value;
  const horsePast = pastData[horseName];
  const workPast = horsePast ? horsePast[workVal] : null;

  let pastSum1 = 0;
  let pastSum2 = 0;
  let sum = { エネルギー: 0, タンパク質: 0, Lys: 0, Ca: 0, P: 0, Mg: 0, Na: 0, K: 0, Fe: 0, Cu: 0, Zn: 0, Mn: 0, Se: 0, Co: 0, VA: 0, VD: 0, VE: 0 };
  let totalFeedWeight = 0;

  document.querySelectorAll("#feed-body tr").forEach((tr, i) => {
    const feed = feeds[i];
    if (!feed) return;
    const isCupFeed = feed.name === "塩";
    let val1 = parseFloat(tr.querySelector(".feed-amount1").value || 0);
    let val2 = parseFloat(tr.querySelector(".feed-amount2").value || 0);
    if (isCupFeed) {
      val1 = val1 / 100;
      val2 = val2 / 100;
    }
    const total = (val1 + val2) * 2;

    const pastArray = (workPast && workPast[feed.name]) ? workPast[feed.name] : [0, 0];
    const pastAm1 = parseFloat(pastArray[0] || 0);
    const pastAm2 = parseFloat(pastArray[1] || 0);

    if (isCupFeed) {
      tr.querySelector(".past-amount1").textContent = pastAm1 > 0 ? (pastAm1 * 100).toFixed(0) + "杯" : "-";
      tr.querySelector(".past-amount2").textContent = pastAm2 > 0 ? (pastAm2 * 100).toFixed(0) + "杯" : "-";
    } else {
      tr.querySelector(".past-amount1").textContent = pastAm1 > 0 ? pastAm1.toFixed(1) : "-";
      tr.querySelector(".past-amount2").textContent = pastAm2 > 0 ? pastAm2.toFixed(1) : "-";
    }

    if (!isCupFeed) {
      pastSum1 += pastAm1;
      pastSum2 += pastAm2;
      totalFeedWeight += total;
    }
    for (const key in sum) sum[key] += feed[key] * total;
  });

  const weight = parseInt(weightVal);
  const work = workVal;
  const req = getRequirements(weight, work);
  if (!req) {
  console.error("要求量データ(req)が取得できませんでした");
  return;
}
  const ca_p = sum["Ca"] / sum["P"] || 0;
  const zn_cu = sum["Zn"] / sum["Cu"] || 0;
  const total_bw = (totalFeedWeight / weight * 100) || 0;

  let html = `<table style="table-layout: fixed; width: 100%;"><thead><tr><th>栄養素</th><th>充足率</th></tr></thead><tbody>`;
  for (const key in sum) {
    const reqVal = req[key] || 1;
    const rate = (sum[key] / reqVal * 100);
    const rateText = rate.toFixed(1);
    let gradColor = `linear-gradient(to right, #003300 0%, #008000 100%)`;
    if (rate > 120) {
      gradColor = `linear-gradient(to right, #8b0000 0%, #ff0000 100%)`;
    } else if (rate < 80) {
      gradColor = `linear-gradient(to right, #004080 0%, #0099ff 100%)`;
    }

    const barWidth = Math.min(rate/1.2, 100);
    const markPosition = (100 / 120) * 100;

    html += `<tr>
      <td>${key}</td>
      <td>
        <div class="bar-container" style="position: relative; width: 100%;">
          <span class="bar-label">${rateText}%</span>
          <div class="bar-fill" style="width: ${barWidth}%; background: ${gradColor}; height: 20px;"></div>
          <div class="line-100" style="position: absolute; left: ${markPosition}%; top: 0; bottom: 0; border-left: 1px dashed #333; z-index: 2; pointer-events: none;"></div>
        </div>
      </td>
    </tr>`;
  }
  html += "</tbody></table>";
  document.getElementById("result").innerHTML = html;

  let ca_p_color = ca_p < 1 ? "darkblue" : (ca_p <= 6 ? "darkgreen" : "firebrick");
  let zn_cu_color = zn_cu < 3 ? "darkblue" : (zn_cu <= 6 ? "darkgreen" : "firebrick");
  let bw_color = total_bw < 1.5 ? "darkblue" : (total_bw <= 2.5 ? "darkgreen" : "firebrick");

  let htmlbalance = `
  <table class="balance-table" style="table-layout: fixed; width: 100%;">
    <tbody>
      <tr>
        <td style="width: 15px;">${ca_p < 1.0 ? `<span style="color: ${ca_p_color};">&#9888;<br><small>Low</small></span>` : (ca_p > 6.0 ? `<span style="color: ${ca_p_color};">&#9888;<br><small>High</small></span>` : '<span style="color: darkgreen;">&check;</span>')}</td>
        <td style="width: 50px; text-align: center; color: ${ca_p_color};">Ca/P</td><td style="position: relative; height: 45px; vertical-align: middle; padding: 0 10px;">
          <div style="background: #eee; height: 10px; width: 100%; position: relative;">
            <div style="position: absolute; left: 0; width: 12.5%; height: 100%; background: darkblue; text-align: left;"></div><div style="position: absolute; left: 12.5%; width: 6.25%; height: 100%; background: limegreen;"></div><div style="position: absolute; left: 18.75%; width: 12.5%; height: 100%; background: darkgreen;"></div><div style="position: absolute; left: 31.25%; width: 43.75%; height: 100%; background: limegreen;"></div><div style="position: absolute; left: 75%; width: 25%; height: 100%; background: firebrick; text-align: right;"></div>
            <div style="position: absolute; top: 12px; left: 0; width: 100%; display: flex; justify-content: space-between; font-size: 9px; color: #999; padding: 0 2px;"><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span></div>
            <div style="position: absolute; bottom: 0px; left: 15%; font-size: 9px; color: white; white-space: nowrap;">理想 1.0~6.0（1.5~2.5が最適）</div>
            <div style="position: absolute; left: ${Math.min((ca_p / 8) * 100, 98)}%; top: 50%; transform: translateX(-50%); z-index: 2;">
              <div style="position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); font-size: 11px; color: ${ca_p_color}; white-space: nowrap;">${ca_p.toFixed(1)}</div>
              <div style="width: 12px; height: 12px; background: #fff; border-radius: 50%; margin-top: -6px; border: 1px solid #000; box-shadow: 0 1px 3px rgba(0,0,0,0.3);"></div>
            </div>
          </div>
        </td>
      </tr>
      <tr>
        <td>${zn_cu < 3.0 ? `<span style="color: ${zn_cu_color};">&#9888;<br><small>Low</small></span>` : (zn_cu > 6.0 ? `<span style="color: ${zn_cu_color};">&#9888;<br><small>High</small></span>` : '<span style="color: darkgreen;">&check;</span>')}</td>
        <td style="text-align: center; color: ${zn_cu_color};">Zn/Cu</td><td style="position: relative; height: 45px; vertical-align: middle; padding: 0 10px;">
          <div style="background: #eee; height: 10px; width: 100%; position: relative;">
            <div style="position: absolute; left: 0; width: 37.5%; height: 100%; background: darkblue;"></div><div style="position: absolute; left: 37.5%; width: 37.5%; height: 100%; background: limegreen;"></div><div style="position: absolute; left: 75%; width: 25%; height: 100%; background: firebrick;"></div>
            <div style="position: absolute; top: 15px; left: 0; width: 100%; display: flex; justify-content: space-between; font-size: 9px; color: #999; padding: 0 2px;"><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span><span>6</span><span>7</span><span>8</span></div>
            <div style="position: absolute; bottom: 0px; left: 37.5%; font-size: 9px; color: white; white-space: nowrap;">理想: 3.0-6.0</div>
            <div style="position: absolute; left: ${Math.min((zn_cu / 8) * 100, 98)}%; top: 50%; transform: translateX(-50%); z-index: 2;">
              <div style="position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); font-size: 11px; color: ${zn_cu_color}; white-space: nowrap;">${zn_cu.toFixed(1)}</div>
              <div style="width: 12px; height: 12px; background: #fff; border-radius: 50%; margin-top: -6px; border: 1px solid #000; box-shadow: 0 1px 3px rgba(0,0,0,0.3);"></div>
            </div>
          </div>
        </td>
      </tr>
      <tr>
        <td>${total_bw <= 1.5 ? `<span style="color: ${bw_color};">&#9888;<br><small>Low</small></span>` : (total_bw >= 2.5 ? `<span style="color: ${bw_color};">&#9888;<br><small>High</small></span>` : '<span style="color: darkgreen;">&check;</span>')}</td>
        <td style="text-align: center; color: ${bw_color};">体重比</td><td style="position: relative; height: 45px; vertical-align: middle; padding: 0 10px;">
          <div style="background: #eee; height: 10px; width: 100%; position: relative;">
            <div style="position: absolute; left: 0; width: 30%; height: 100%; background: darkblue;"></div><div style="position: absolute; left: 30%; width: 20%; height: 100%; background: limegreen;"></div><div style="position: absolute; left: 50%; width: 50%; height: 100%; background: firebrick;"></div>
            <div style="position: absolute; top: 12px; left: 0; width: 100%; display: flex; justify-content: space-between; font-size: 9px; color: #999; padding: 0 2px;"><span>0</span><span>1</span><span>2</span><span>3</span><span>4</span><span>5</span></div>
            <div style="position: absolute; bottom: 0px; left: 30%; font-size: 9px; color: white; white-space: nowrap;">理想: 1.5~2.5%</div>
            <div style="position: absolute; left: ${Math.min((total_bw / 5) * 100, 98)}%; top: 50%; transform: translateX(-50%); z-index: 2;">
              <div style="position: absolute; bottom: 12px; left: 50%; transform: translateX(-50%); font-size: 11px; color: ${bw_color}; white-space: nowrap;">${total_bw.toFixed(1)}%</div>
              <div style="width: 12px; height: 12px; background: #fff; border-radius: 50%; margin-top: -6px; border: 1px solid #000; box-shadow: 0 1px 3px rgba(0,0,0,0.3);"></div>
            </div>
          </div>
        </td>
      </tr>
    </tbody>
  </table>`;
  document.getElementById("result-balance").innerHTML = htmlbalance;

  const alertEl = document.getElementById("alert-messages");
  let messages = [];
  const selectedOption = weightSelect.options[weightSelect.selectedIndex];

  if (selectedOption.classList.contains("senior")) messages.push("<span>&#12959; 高齢馬なので濃厚は控えめに．</span>");
  if (selectedOption.classList.contains("nobeet")) {
    const beetRow = document.querySelectorAll("#feed-body tr")[0];
    if (beetRow) {
      const beetTotal = (parseFloat(beetRow.querySelector(".feed-amount1").value || 0) + parseFloat(beetRow.querySelector(".feed-amount2").value || 0)) * 2;
      messages.push(beetTotal > 0 ? "<span style='color: firebrick;'>&#9888; クライムは喉詰まりを起こすのでビートNG</span>" : "<span style='color: darkgreen;'>&check; クライムは喉詰まりを起こすのでビートNG</span>");
    }
  }

  const deReq = req["エネルギー"] || 1;
  const deRate = (sum["エネルギー"] / deReq) * 100;
  messages.push(deRate < 90 ? `<span style='color: darkblue;'>&#9888; エネルギーが不足しています（${deRate.toFixed(1)}%）</span>` : deRate > 120 ? `<span style='color: firebrick;'>&#9888; エネルギーが過剰です（${deRate.toFixed(1)}%）</span>` : `<span style='color: darkgreen;'>&check; エネルギーは十分です（${deRate.toFixed(1)}%）</span>`);

  const cpReq = req["タンパク質"] || 1;
  const cpRate = (sum["タンパク質"] / cpReq) * 100;
  messages.push(cpRate < 90 ? `<span style='color: darkblue;'>&#9888; タンパク質が不足しています（${cpRate.toFixed(1)}%）</span>` : cpRate > 120 ? `<span style='color: firebrick;'>&#9888; タンパク質が過剰です（${cpRate.toFixed(1)}%）</span>` : `<span style='color: darkgreen;'>&check; タンパク質は十分です（${cpRate.toFixed(1)}%）</span>`);
  alertEl.innerHTML = messages.join("<br>");

  let sum1 = 0, sum2 = 0, totalSum = 0;
  document.querySelectorAll("#feed-body tr").forEach((tr, i) => {
    const feed = feeds[i];
    if (!feed || feed.name === "塩") {
      return;
    }
    let val1 = parseFloat(tr.querySelector(".feed-amount1").value || 0);
    let val2 = parseFloat(tr.querySelector(".feed-amount2").value || 0);
    sum1 += val1;
    sum2 += val2;
    totalSum += (val1 + val2) * 2;
  });

  document.getElementById("sum-body").innerHTML = `
    <tr>
      <td><b>合計</b></td>
      <td><input type="number" class="sum" value="${sum1.toFixed(1)}" readonly>kg</td>
      <td><input type="number" class="sum" value="${sum2.toFixed(1)}" readonly>kg</td>
      <td><input type="number" class="sum" value="${totalSum.toFixed(1)}" readonly>kg</td>
      <td class="past-text">${pastSum1 > 0 ? pastSum1.toFixed(1) : "-"}</td>
      <td class="past-text">${pastSum2 > 0 ? pastSum2.toFixed(1) : "-"}</td>
    </tr>`;
}

function resetInputs() {
  document.querySelectorAll("#feed-body tr").forEach((tr, i) => {
    const feed = feeds[i];
    if (!feed) return;
    const isCupFeed = feed.name === "塩";
    
    let def1 = feed.default1;
    let def2 = feed.default2;
    if (isCupFeed) {
      def1 = def1 ? (parseFloat(def1) * 100).toFixed(0) : "";
      def2 = def2 ? (parseFloat(def2) * 100).toFixed(0) : "";
    }

    tr.querySelector(".feed-amount1").value = def1;
    tr.querySelector(".feed-amount2").value = def2;
            
    const val1 = parseFloat(tr.querySelector(".feed-amount1").value || 0);
    const val2 = parseFloat(tr.querySelector(".feed-amount2").value || 0);
            
    if (isCupFeed) {
      tr.querySelector(".feed-total").value = ((val1 + val2) * 2).toFixed(0);
    } else {
      tr.querySelector(".feed-total").value = ((val1 + val2) * 2).toFixed(1);
    }
  });
  calculate();
}

async function saveDataToSpreadsheet() {
  const GAS_URL = WEB_APP_URL;

  const weightSelect = document.getElementById("weight");
  const horseName =
    weightSelect.options[weightSelect.selectedIndex].text;

  const weight = weightSelect.value;
  const workVal = document.getElementById("work").value;

  // 朝夕・昼夜それぞれのデータを作る
  const morningEvening = {};
  const dayNight = {};

  document.querySelectorAll("#feed-body tr").forEach((tr, i) => {
    const feedName = tr.cells[0].innerText;

    morningEvening[feedName] =
      tr.querySelector(".feed-amount1").value || "";

    dayNight[feedName] =
      tr.querySelector(".feed-amount2").value || "";
  });

  const payload = {
    horseName: horseName,
    weight: weight,
    workVal: workVal,
    morningEvening: morningEvening,
    dayNight: dayNight
  };

  try {
    const response = await fetch(GAS_URL, {
      method: "POST",
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (result.status === "success") {
      alert("スプレッドシートにデータを保存しました！");
    } else {
      alert("保存に失敗しました: " + result.message);
    }

  } catch (error) {
    console.error("通信エラー:", error);
    alert("通信エラーが発生しました。");
  }
}
