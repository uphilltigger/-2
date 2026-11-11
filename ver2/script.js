
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbyAMUYBycyKkciLnV-V5-Ny6PWzxEqElXNoxZPVy55R7Tyt9dL-UzGJPC5nwL-C9CoC/exec";

// 1回分の給与量を入力する場合は2
// 1日合計量を入力する場合は1
const FEEDINGS_PER_DAY = 2;

// 表示する飼料
const feedNames = [
  "ビート",
  "麦",
  "キューブ",
  "大豆粕",
  "ベルテ",
  "濃厚",
  "ふすま",
  "塩",
  "乾草"
];

// 計算する栄養素
const nutrients = [
  "エネルギー",
  "タンパク質",
  "Lys",
  "Ca",
  "P",
  "Mg",
  "Na",
  "K",
  "Fe",
  "Cu",
  "Zn",
  "Mn",
  "Se",
  "Co",
  "VA",
  "VD",
  "VE"
];

const workOptions = ["無", "軽", "中", "強"];

let horses = [];
let feeds = [];
let requirements = [];
let initialFeedAmounts = {};

// 飼料名の対応
const feedAliases = {
  "キューブ": ["キューブ", "ヘイキューブ"],
  "麦": ["麦", "燕麦"]
};

// 数値変換
function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

// 飼料名から成分データを探す
function findFeed(name) {
  const names = feedAliases[name] || [name];

  return feeds.find(feed =>
    names.includes(String(feed.name).trim())
  );
}

// ==========================
// GASからデータを取得
// ==========================

async function loadData() {
  try {
    const response = await fetch(WEB_APP_URL);

    if (!response.ok) {
      throw new Error("データ取得に失敗しました");
    }

    const data = await response.json();

    horses = data.horses || [];
    feeds = data.feeds || [];
    requirements = data.requirements || [];
    initialFeedAmounts = data.initialFeedAmounts || {};

    createInputTable();

  } catch (error) {
    console.error(error);

    document.getElementById("inputTable").innerHTML =
      '<tr><td colspan="13">データを取得できませんでした</td></tr>';
  }
}

// ==========================
// 上の入力表を作成
// ==========================

function createInputTable() {
  const table = document.getElementById("inputTable");
  table.innerHTML = "";

  horses.forEach((horse, index) => {
    const row = document.createElement("tr");

    // 馬名
    const nameCell = document.createElement("td");
    nameCell.textContent = horse.name;
    row.appendChild(nameCell);

    // 強度プルダウン
    const workCell = document.createElement("td");
    const select = document.createElement("select");

    select.id = `work-${index}`;

    workOptions.forEach(work => {
      const option = document.createElement("option");
      option.value = work;
      option.textContent = work;
      select.appendChild(option);
    });

    select.addEventListener("change", () => {
      calculate(index);
    });

    workCell.appendChild(select);
    row.appendChild(workCell);

    // 飼料入力欄
    feedNames.forEach((feedName, feedIndex) => {
      const cell = document.createElement("td");
      const input = document.createElement("input");
      const initialValue =
       initialFeedAmounts[horse.name]?.[feedName] ?? 0;

      input.value = initialValue;
      input.type = "number";
      input.min = "0";
      input.step = "0.1";
      input.id = `feed-${index}-${feedIndex}`;

      input.addEventListener("input", () => {
        calculate(index);
      });

      cell.appendChild(input);
      row.appendChild(cell);
    });

    table.appendChild(row);
  });

  createResultTable();

  // 初期計算
  horses.forEach((horse, index) => {
    calculate(index);
  });
}

// ==========================
// 下の結果表を作成
// ==========================

function createResultTable() {
  const table = document.getElementById("resultTable");
  table.innerHTML = "";

  horses.forEach((horse, index) => {
    const row = document.createElement("tr");

    // 馬名
    const nameCell = document.createElement("td");
    nameCell.textContent = horse.name;
    row.appendChild(nameCell);

    // 栄養素の結果欄
    nutrients.forEach((nutrient, nutrientIndex) => {
      const cell = document.createElement("td");

      cell.id = `result-${index}-${nutrientIndex}`;
      cell.textContent = "-";

      row.appendChild(cell);
    });

    table.appendChild(row);
  });
}

// ==========================
// 要求量を取得
// 体重と強度から要求量を補間
// ==========================

function getRequirement(weight, work, nutrient) {
  const rows = requirements
    .filter(row =>
      String(row["強度"]).trim() === work &&
      Number.isFinite(Number(row["体重"]))
    )
    .sort((a, b) =>
      Number(a["体重"]) - Number(b["体重"])
    );

  if (rows.length === 0) return null;

  // 体重が最小以下
  if (weight <= Number(rows[0]["体重"])) {
    return toNumber(rows[0][nutrient]);
  }

  // 体重が最大以上
  const last = rows[rows.length - 1];

  if (weight >= Number(last["体重"])) {
    return toNumber(last[nutrient]);
  }

  // 体重が一致する行を探す
  const exact = rows.find(row =>
    Number(row["体重"]) === weight
  );

  if (exact) {
    return toNumber(exact[nutrient]);
  }

  // 前後の体重から線形補間
  for (let i = 0; i < rows.length - 1; i++) {
    const lower = rows[i];
    const upper = rows[i + 1];

    const lowerWeight = Number(lower["体重"]);
    const upperWeight = Number(upper["体重"]);

    if (weight > lowerWeight && weight < upperWeight) {
      const lowerValue = toNumber(lower[nutrient]);
      const upperValue = toNumber(upper[nutrient]);

      const ratio =
        (weight - lowerWeight) /
        (upperWeight - lowerWeight);

      return lowerValue +
        (upperValue - lowerValue) * ratio;
    }
  }

  return null;
}

// ==========================
// 充足率を計算
// ==========================

function calculate(horseIndex) {
  const horse = horses[horseIndex];

  if (!horse) return;

  const weight = Number(horse.weight);

  const work = document.getElementById(
    `work-${horseIndex}`
  ).value;

  // 飼料ごとの給与量を取得
  const amounts = feedNames.map((name, feedIndex) => {
    const input = document.getElementById(
      `feed-${horseIndex}-${feedIndex}`
    );

    return Math.max(0, toNumber(input.value));
  });

  // 栄養素ごとに計算
  nutrients.forEach((nutrient, nutrientIndex) => {

    // 飼料からの栄養摂取量を合計
    let intake = 0;

    feedNames.forEach((feedName, feedIndex) => {
      const feed = findFeed(feedName);

      if (!feed) return;

      const amount = amounts[feedIndex];

      const nutrientValue = toNumber(feed[nutrient]);

      intake += amount *
        nutrientValue *
        FEEDINGS_PER_DAY;
    });

    // 要求量を取得
    const requirement = getRequirement(
      weight,
      work,
      nutrient
    );

    const cell = document.getElementById(
      `result-${horseIndex}-${nutrientIndex}`
    );

    if (requirement === null || requirement <= 0) {
      cell.textContent = "-";
      return;
    }

    // 充足率
    const percentage = intake / requirement * 100;

// 色分け
let status = "result-normal";

if (percentage < 90) {
  status = "result-low";
} else if (percentage > 120) {
  status = "result-high";
}

// 棒グラフの幅（最大150%）
const barWidth = Math.min(percentage / 150 * 100, 100);

cell.className = `result-cell ${status}`;

cell.innerHTML = `
  <div class="result-number">
    ${percentage.toFixed(1)}%
  </div>
  <div class="bar-container">
    <div class="bar-fill" style="width:${barWidth}%"></div>
  </div>
`;  });
}

loadData();
