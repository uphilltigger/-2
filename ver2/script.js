
const WEB_APP_URL =
  "https://script.google.com/macros/s/AKfycbyAMUYBycyKkciLnV-V5-Ny6PWzxEqElXNoxZPVy55R7Tyt9dL-UzGJPC5nwL-C9CoC/exec";

const FEEDINGS_PER_DAY = 2;

const feedNames = [
  "ビート", "麦", "キューブ", "大豆粕",
  "ベルテ", "濃厚", "ふすま", "塩", "乾草"
];

const nutrients = [
  "エネルギー", "タンパク質", "Lys", "Ca", "P",
  "Mg", "Na", "K", "Fe", "Cu", "Zn", "Mn",
  "Se", "Co", "VA", "VD", "VE"
];

let horses = [];
let feeds = [];
let requirements = [];
let initialFeedAmounts = {};
let commonFeedAmounts = {};


/* =========================
   データ読み込み
========================= */

async function loadData() {
  try {
    const response = await fetch(WEB_APP_URL);
    const data = await response.json();

    horses = data.horses || [];
    feeds = data.feeds || [];
    requirements = data.requirements || [];
    initialFeedAmounts = data.initialFeedAmounts || {};
    commonFeedAmounts = data.commonFeedAmounts || {};

    createInputTable();
    createCommonFeedTable();
    createResultTable();

    const workSelect = document.getElementById("work");

    if (workSelect) {
      workSelect.addEventListener("change", calculateAll);
    }

    calculateAll();

  } catch (error) {
    console.error("データ読み込みエラー:", error);
    alert("データの読み込みに失敗しました。");
  }
}


/* =========================
   飼料検索
========================= */

function findFeed(name) {
  return feeds.find(feed =>
    String(feed.name).trim() === name
  );
}


/* =========================
   初期給与量
========================= */

function getInitialAmount(horse, feedName, feedIndex) {
  const horseData = initialFeedAmounts[horse.name];

  if (Array.isArray(horseData)) {
    return Number(horseData[feedIndex]) || 0;
  }

  if (horseData && typeof horseData === "object") {
    return Number(horseData[feedName]) || 0;
  }

  return 0;
}


/* =========================
   馬ごとの入力表
   元の形：入力欄は1つ
========================= */

function createInputTable() {
  const table = document.getElementById("inputTable");

  let html = "";

  horses.forEach((horse, horseIndex) => {
    html += `<tr><td>${horse.name}</td>`;

    feedNames.forEach((feedName, feedIndex) => {
      const amount = getInitialAmount(
        horse,
        feedName,
        feedIndex
      );

      html += `
        <td>
          <input
            type="number"
            inputmode="decimal"
            step="0.1"
            min="0"
            id="feed-${horseIndex}-${feedIndex}"
            value="${amount}"
          >
        </td>
      `;
    });

    html += "</tr>";
  });

  table.innerHTML = html;

  table.addEventListener("input", event => {
    if (!event.target.id.startsWith("feed-")) return;

    const horseIndex = Number(event.target.id.split("-")[1]);
    calculate(horseIndex);
  });
}


/* =========================
   昼・夜の共通入力表
========================= */

function createCommonFeedTable() {
  const table = document.getElementById("commonFeedTable");

  // 昼夜に与える飼料だけ
  const commonFeedNames = [
    "麦", "ベルテ", "ふすま", "塩", "乾草"
  ];

  let html = `
    <thead>
      <tr>
        <th colspan="2">昼夜</th>
      </tr>
    </thead>
    <tbody>
  `;

  commonFeedNames.forEach(feedName => {
    const feedIndex = feedNames.indexOf(feedName);

    html += `
      <tr>
        <td>${feedName}</td>
        <td>
          <input
            type="number"
            inputmode="decimal"
            step="0.1"
            min="0"
            id="common-feed-${feedIndex}"
            value="${commonFeedAmounts[feedName] ?? 0}"
          >
        </td>
      </tr>
    `;
  });

  html += "</tbody>";
  table.innerHTML = html;

  table.addEventListener("input", event => {
    if (!event.target.id.startsWith("common-feed-")) return;
    calculateAll();
  });
}


/* =========================
   結果表
========================= */

function createResultTable() {
  const table = document.getElementById("resultTable");

  let html = "";

  horses.forEach((horse, horseIndex) => {
    html += `
      <tr>
        <td>${horse.name}</td>
        ${nutrients.map((n, nutrientIndex) => `
          <td
            id="result-${horseIndex}-${nutrientIndex}"
            class="result-cell"
          >-</td>
        `).join("")}
      </tr>
    `;
  });

  table.innerHTML = html;
}


/* =========================
   必要量の取得
   体重による線形補間
========================= */

function getRequirement(weight, work, nutrient) {
  const rows = requirements.filter(row =>
    String(row["強度"]).trim() === String(work).trim() &&
    Number(row["体重"]) > 0 &&
    row[nutrient] !== undefined &&
    row[nutrient] !== ""
  );

  if (rows.length === 0) return null;

  rows.sort((a, b) =>
    Number(a["体重"]) - Number(b["体重"])
  );

  if (weight <= Number(rows[0]["体重"])) {
    return Number(rows[0][nutrient]);
  }

  const last = rows[rows.length - 1];

  if (weight >= Number(last["体重"])) {
    return Number(last[nutrient]);
  }

  for (let i = 0; i < rows.length - 1; i++) {
    const lower = rows[i];
    const upper = rows[i + 1];

    const lowerWeight = Number(lower["体重"]);
    const upperWeight = Number(upper["体重"]);

    if (weight >= lowerWeight && weight <= upperWeight) {
      const ratio =
        (weight - lowerWeight) /
        (upperWeight - lowerWeight);

      return Number(lower[nutrient]) +
        (Number(upper[nutrient]) - Number(lower[nutrient])) * ratio;
    }
  }

  return null;
}


/* =========================
   1頭分の計算
========================= */

function calculate(horseIndex) {
  const horse = horses[horseIndex];
  if (!horse) return;

  const work = document.getElementById("work")?.value;

  const weight = Number(
    horse.weight ?? horse["体重"]
  );

  const intake = {};

  nutrients.forEach(nutrient => {
    intake[nutrient] = 0;
  });

  feedNames.forEach((feedName, feedIndex) => {
    const feed = findFeed(feedName);
    if (!feed) return;

    // 馬ごとの飼料量
    const horseAmount = Number(
      document.getElementById(
        `feed-${horseIndex}-${feedIndex}`
      )?.value
    ) || 0;

    // 昼・夜の共通飼料量
    const commonAmount = Number(
      document.getElementById(
        `common-feed-${feedIndex}`
      )?.value
    ) || 0;

    // 朝＋夕＋昼＋夜
    const totalAmount =
      horseAmount * FEEDINGS_PER_DAY +
      commonAmount * FEEDINGS_PER_DAY;

    nutrients.forEach(nutrient => {
      const value = Number(feed[nutrient]) || 0;

      intake[nutrient] += totalAmount * value;
    });
  });


  // 充足率の表示
  nutrients.forEach((nutrient, nutrientIndex) => {
    const cell = document.getElementById(
      `result-${horseIndex}-${nutrientIndex}`
    );

    if (!cell) return;

    const requirement = getRequirement(
      weight,
      work,
      nutrient
    );

    if (
      requirement === null ||
      !Number.isFinite(requirement) ||
      requirement <= 0
    ) {
      cell.textContent = "-";
      cell.className = "result-cell";
      return;
    }

    const percentage =
      intake[nutrient] / requirement * 100;

    cell.textContent =
      `${Math.round(percentage)}%`;

    let status = "result-normal";

    if (percentage < 90) {
      status = "result-low";
    } else if (percentage > 120) {
      status = "result-high";
    }

    cell.className = `result-cell ${status}`;
  });
}


/* =========================
   全頭再計算
========================= */

function calculateAll() {
  horses.forEach((horse, index) => {
    calculate(index);
  });
}


/* =========================
   起動
========================= */

loadData();
