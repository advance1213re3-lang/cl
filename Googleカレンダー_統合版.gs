/*************************************************************************
 * 【清掃SS / 内装SS 用】作業日程カレンダー連携 — ヘッダー名で列を自動検出する版
 *
 * ★重要：列は「固定番号」ではなく「ヘッダー名」で探します。
 *   見出し行(1行目)にある『担当者』『作業日』『Googleカレンダー』の文字を探して、
 *   その列を使うので、シートの列構成が違っても・列が増減してもズレません。
 *
 * ★説明文（カレンダー予定の詳細）は「カレンダー書式」タブが唯一の管理元です。
 *   タブに書いて“表示ON”にした行だけを、その順番で出します。
 *   タブに無いものは一切入れません（既定書式はタブが存在しない時だけの保険）。
 *
 * ★アプリ連携：☑ON（または「一括同期」）のたびに、カレンダー登録と同時に
 *   Supabase cl_cases（チェックリストアプリのデータ）へも自動で入る。
 *   → カレンダーの予定をタップすると /cl/ アプリで案件が開く。別ファイル・手動同期は不要。
 *
 * 役割：
 *   案件管理シートに 担当者 / 作業日(ダブルクリックで日付ピッカー) / Googleカレンダー(☑)
 *   の3列を用意し、☑ONで作業日程をカレンダーへ自動登録。担当者をゲスト招待＋
 *   説明欄にチェックリスト。立会なしの清掃のみ・在宅清掃も対象。
 *
 * 設計：
 *   ・同期キーは「案件No」。5分採番後の取りこぼしは10分ごとの時刻トリガーで回収。
 *   ・担当者マスタは案件一覧マスター(1か所)を参照（名前→Gmail→色）。
 *   ・既存コード(自動採番/色付け/PDF仕分け)には一切触れない。CAL2_接頭辞・installableトリガー。
 *
 * 【導入手順（清掃SS と 内装SS の両方で）】
 *   (1) 拡張機能→Apps Script で、このコードを（既存のカレンダー連携ファイルに）全部貼付け。
 *   (2) ★CAL2_CFG.mode を、清掃SSなら 'seisou' / 内装SSなら 'naiso' に設定。
 *   (3) CAL2_CFG.calendars に 清掃用・内装用カレンダーIDを貼る。
 *   (4) 関数「CAL2_setup」を ▶実行（初回は権限承認）。
 *       → 『担当者』『作業日』『Googleカレンダー』列が無ければ末尾に自動作成し、
 *         作業日=日付入力、Googleカレンダー=チェックボックスを設定します。
 *   (5) シートを開き直す → メニュー「📅 作業カレンダー」。担当者・作業日を入れて☑ON。
 *   (6) 既存の案件をアプリに入れるには、メニュー「チェックON行を一括同期」を1回実行。
 *
 * 【今ズレている場合の復旧】
 *   ・見出し行の『担当者』『作業日』『Googleカレンダー』が正しい列に付いているか確認。
 *   ・もし前バージョンが付けた“余分なチェックボックス/日付入力規則”が別の列に残っていたら、
 *     その範囲を選択 → データ → データの入力規則 → ルールを削除 でクリアしてください。
 *   ・データ(名前/日付/チェック)が正しい見出しの下に来るように直してから CAL2_setup を再実行。
 *************************************************************************/

const CAL2_CFG = {
  // ★清掃SSでは 'seisou' / 内装SSでは 'naiso'
  mode: 'naiso',

  sheetName: '案件管理',
  headerRow: 1,
  dataStartRow: 2,

  // ★列の直接指定（ズレ対策の“逃げ道”）。
  //   空文字 '' なら → 見出し名で自動検出。列文字('P')か列番号(16)で固定指定できる。
  //   例）名前が入っている列がR、日付がS、チェックがP なら：
  //       '担当者':'R', '作業日':'S', 'チェック':'P' のように設定。
  colOverride: {
    '案件No': '',
    '受注先': '',
    '物件名': '',
    '号室': '',
    '住所': '',
    '納期': '',
    '鍵情報': '',
    '作業内容': '',
    '担当者': '',
    '作業日': '',
    '作業終了日': '',  // ← 数日かかる案件の終了日（空なら1日）
    'チェック': '',   // ← カレンダー登録のチェックボックス列（見出し: Googleカレンダー）
    '登録者': '',
    '登録日時': '',
    '連絡事項': '',
    '完了': '',
    'ロック': '',      // ← ONの行はカレンダー予定を上書きしない（微調整を保護）
    '発注書リンク': '',  // ← 案件受付ボットが入れたPDF URL列（内装の見出し「URLリンク」）
  },

  // ▼▼▼ 通知設定（作業完了☑・連絡事項の編集で通知） ▼▼▼
  notify: {
    enabled: true,
    onComment: true,   // 連絡事項が入力されたら通知
    onDone: true,      // 完了☑がONになったら通知
    email: 'advance.1213.re3@gmail.com',  // 通知先メール（カンマ区切りで複数可）
    //   ※メール送信には appsscript.json に
    //     "https://www.googleapis.com/auth/script.send_mail" が必要です
    lineToken: '',     // （後でLINEを使うとき）チャネルアクセストークン
    lineTo: '',        // （後でLINEを使うとき）送信先 グループID/ユーザーID
  },
  // ▲▲▲ ここまで ▲▲▲

  // 連絡事項の“よく使う文”プルダウン（選ぶだけで入力。自由入力も可）
  commentPresets: ['作業終了', '本日完了', '遅延あり', '鍵で問題あり', '追加作業あり', '再訪が必要', '入室できず'],

  // 作業報告フォーム（職人さんがカレンダーから報告）。RPT_createForm 実行後に出る
  // プレフィルURL（__CASE__/__PROP__/__REPORTER__ を含む）をそのまま貼り付け。
  reportForm: {
    prefillTemplate: 'https://docs.google.com/forms/d/e/1FAIpQLSfZdCK51_-LGYlNma4VCa531TT4LtKEtf0eVBUs4iTS96T1Rw/viewform?usp=pp_url&entry.490240472=__CASE__&entry.487116496=__PROP__&entry.187445792=__REPORTER__',
  },

  // 作業開始連絡リンク：報告フォームのWebアプリURL（/exec）を貼る。空なら出ない。
  startLinkBase: 'https://script.google.com/macros/s/AKfycbzJ4sg1Nn8TXY4UhiSDPSVZSb9ZnzGmnslClo-LMmZx3W5MSwsDLsFQzNvBcXjkyWCPxQ/exec',

  // チェックリスト（統合アプリ）のWebアプリURL（/exec）を貼る。空なら出ない。
  //   予定タップ → その案件No のチェックリストに直行（案件Noは自動で付きます）。
  checklistBase: 'https://advance1213re3-lang.github.io/cl/',

  // ▼▼▼ アプリ用DB（Supabase cl_cases）連携。☑同期に相乗りで自動書込 ▼▼▼
  //   apikey はアプリ埋め込みと同じ公開用の匿名キー。
  supabase: {
    url: 'https://vfreehhenmwrbxkhcdvu.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmcmVlaGhlbm13cmJ4a2hjZHZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTE5NTAsImV4cCI6MjA5OTUyNzk1MH0.UQKIOeJmn0Yt6gqUC_TF0uoFiRl4poTJyv_tx6BotS8',
    casesTable: 'cl_cases',
  },
  // ▲▲▲ ここまで ▲▲▲

  // 見出し名の候補（実際のシートに合わせて必要なら追記OK）
  headerNames: {
    caseNo:       ['案件No', '案件NO', '案件№', '案件ｎｏ'],
    vendor:       ['受注先', '管理会社', '業者', '業者名'],
    propertyName: ['物件名'],
    room:         ['号室', '部屋番号', '室番号'],
    address:      ['住所', '現場住所', '物件住所', '所在地'],
    due:          ['納期', '工期'],
    keyInfo:      ['鍵情報', '鍵の場所', '鍵の保管場所', '解錠方法', '鍵'],
    workContent:  ['作業項目', '作業内容', '施工内容', '内容'],
    comment:      ['連絡事項', 'コメント', '伝達事項'],
    done:         ['完了', '作業完了', '作業終了', '済'],
    lock:         ['ロック', 'ロック中', '固定'],
    assignee:     ['担当者'],
    workDate:     ['作業日', '作業開始日', '作業日（開始）'],
    workEndDate:  ['作業終了日', '終了日', '作業日（終了）'],
    trigger:      ['Googleカレンダー', 'ｇｏｏｇｌｅカレンダー', 'カレンダー'],
    registrant:   ['登録者', '登録者名'],
    registeredAt: ['登録日時', '登録日'],
    orderUrl:     ['URLリンク', '発注書', '発注書URL', 'PDFリンク', 'PDF', 'ドライブリンク'],
  },

  // モード別：カレンダーとチェックリストのみ（列位置はヘッダー検出するので不要）
  modes: {
    seisou: { label: '清掃', calendarKey: 'seisou', checklistKey: 'seisou' },
    naiso:  { label: '内装', calendarKey: 'naiso',  checklistKey: 'naiso'  },
  },

  // 担当者マスタ（案件一覧マスターSSに集約）
  masterSpreadsheetId: '1kKyemeLM2DBQOKLsgBsFKptIIpo4zh-VnY0G18XokBo',
  masterSheetName: '担当者マスタ',
  masterCol: { name: 1, email: 2, color: 3 },

  logSheetName: 'カレンダー連携ログ',
  mapSheetName: 'イベント紐付け',
  formatSheetName: 'カレンダー書式', // ← 説明文テンプレートを編集するタブ

  // 差込項目の選択肢（カレンダー書式タブのプルダウン）
  fieldOptions: ['物件名号室', '物件名', '住所', '納期', '作業日', '担当者', '受注先', '鍵情報', '作業内容', '連絡事項', '発注書リンク', '作業チェックリンク', '報告リンク', '開始連絡リンク', '登録者', '登録日時', '空行', '自由文'],

  // ▼▼▼ カレンダーID ▼▼▼
  calendars: {
    seisou: '94598db499117f4460a516de6b99f51edd4066196b6abea76f5557ec15238a93@group.calendar.google.com', // 清掃 テストカレンダー
    naiso:  '94598db499117f4460a516de6b99f51edd4066196b6abea76f5557ec15238a93@group.calendar.google.com', // 内装 テストカレンダー
    },  // ▲▲▲ ここまで ▲▲▲

  checklists: {
    seisou: ['ハウスクリーニング', '水回り（キッチン/浴室/洗面/トイレ）', '床清掃・ワックス', 'ベランダ', '最終チェック・写真'],
    naiso:  ['クロス張替え', '床（CF/フローリング）', '建具・設備の調整', '塗装/補修', '仕上げクリーニング'],
  },

  colorMap: {
    '赤': 'RED', '青': 'BLUE', '緑': 'GREEN', '黄': 'YELLOW', '黄色': 'YELLOW',
    'オレンジ': 'ORANGE', '橙': 'ORANGE', '水色': 'CYAN', 'シアン': 'CYAN',
    '紫': 'MAUVE', 'グレー': 'GRAY', '灰': 'GRAY',
  },

  defaultDurationMinutes: 60,
  allDayIfMidnight: true,
  tz: 'Asia/Tokyo',
};

function CAL2_mode_() { return CAL2_CFG.modes[CAL2_CFG.mode]; }

/*************************************************************************
 * 列をヘッダー名で検出
 *************************************************************************/
function CAL2_normHeader_(h) { return String(h == null ? '' : h).replace(/[\s　]/g, '').toLowerCase(); }

// 'P'→16 / 16→16 / ''→0
function CAL2_toCol_(v) {
  if (typeof v === 'number') return v > 0 ? Math.floor(v) : 0;
  const s = String(v || '').trim().toUpperCase();
  if (!s) return 0;
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i) - 64;
    if (c < 1 || c > 26) return 0;
    n = n * 26 + c;
  }
  return n;
}

function CAL2_resolveCols_(sh) {
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const headers = sh.getRange(CAL2_CFG.headerRow, 1, 1, lastCol).getValues()[0].map(CAL2_normHeader_);
  const find = (cands) => {
    for (const cand of cands) {
      const idx = headers.indexOf(CAL2_normHeader_(cand));
      if (idx !== -1) return idx + 1;
    }
    return 0;
  };
  const n = CAL2_CFG.headerNames;
  const ov = CAL2_CFG.colOverride || {};
  // 内部キー → colOverride の日本語キー
  const JKEY = {
    caseNo: '案件No', vendor: '受注先', propertyName: '物件名', room: '号室',
    address: '住所', due: '納期', keyInfo: '鍵情報', workContent: '作業内容',
    assignee: '担当者', workDate: '作業日', workEndDate: '作業終了日', trigger: 'チェック',
    registrant: '登録者', registeredAt: '登録日時', comment: '連絡事項', done: '完了', lock: 'ロック', orderUrl: '発注書リンク',
  };
  // 直接指定があればそれを優先、無ければ見出し検出
  const pick = (key, cands) => CAL2_toCol_(ov[JKEY[key]]) || find(cands);
  return {
    caseNo:       pick('caseNo', n.caseNo),
    vendor:       pick('vendor', n.vendor),
    propertyName: pick('propertyName', n.propertyName),
    room:         pick('room', n.room),
    address:      pick('address', n.address),
    due:          pick('due', n.due),
    keyInfo:      pick('keyInfo', n.keyInfo),
    workContent:  pick('workContent', n.workContent),
    assignee:     pick('assignee', n.assignee),
    workDate:     pick('workDate', n.workDate),
    workEndDate:  pick('workEndDate', n.workEndDate),
    trigger:      pick('trigger', n.trigger),
    registrant:   pick('registrant', n.registrant),
    registeredAt: pick('registeredAt', n.registeredAt),
    comment:      pick('comment', n.comment),
    done:         pick('done', n.done),
    lock:         pick('lock', n.lock),
    orderUrl:     pick('orderUrl', n.orderUrl),
  };
}

// 必須列（assignee/workDate/trigger）が無ければ末尾に作成
function CAL2_ensureColumns_(sh) {
  const need = [
    { key: 'assignee', header: '担当者' },
    { key: 'workDate', header: '作業日' },
    { key: 'workEndDate', header: '作業終了日' },
    { key: 'trigger',  header: 'Googleカレンダー' },
    { key: 'registrant',   header: '登録者' },
    { key: 'registeredAt', header: '登録日時' },
    { key: 'comment',      header: '連絡事項' },
    { key: 'done',         header: '完了' },
    { key: 'lock',         header: 'ロック' },
  ];
  let cols = CAL2_resolveCols_(sh);
  need.forEach(item => {
    if (!cols[item.key]) {
      const c = sh.getLastColumn() + 1;
      sh.getRange(CAL2_CFG.headerRow, c).setValue(item.header);
      cols = CAL2_resolveCols_(sh);
    }
  });
  return cols;
}

function CAL2_missingMsg_(cols) {
  const miss = [];
  if (!cols.caseNo) miss.push('案件No');
  if (!cols.propertyName) miss.push('物件名');
  if (!cols.assignee) miss.push('担当者');
  if (!cols.workDate) miss.push('作業日');
  if (!cols.trigger) miss.push('Googleカレンダー');
  return miss;
}

/*************************************************************************
 * メニュー（installable onOpen）
 *************************************************************************/
// メニュー用の通知。UIが無い場面（エディタから▶実行・トリガー実行）ではLoggerに逃がすので、
// CAL2_setup / CAL2_resyncAll などをエディタから直接実行してもgetUiで止まらない。
function CAL2_say_(msg){ try { SpreadsheetApp.getUi().alert(msg); } catch (e) { Logger.log(msg); } }

function CAL2_onOpen(e) { CAL2_buildMenu_(SpreadsheetApp.getUi()); }

function CAL2_buildMenu_(ui) {
  ui.createMenu('📅 作業カレンダー')
    .addItem('初期設定（列検出・体裁・トリガー）', 'CAL2_setup')
    .addItem('チェックON行を一括同期', 'CAL2_resyncAll')
    .addItem('担当者リストを更新（マスタ反映）', 'CAL2_refreshAssigneeList')
    .addItem('接続チェック（アカウント/カレンダー確認）', 'CAL2_diag')
    .addToUi();
}

/*************************************************************************
 * 接続チェック：実行アカウントとカレンダーへのアクセス可否を表示
 *************************************************************************/
function CAL2_diag() {
  const m = CAL2_mode_();
  const id = CAL2_CFG.calendars[m.calendarKey];
  let email = '';
  try { email = Session.getEffectiveUser().getEmail(); } catch (e) {}
  if (!email) { try { email = Session.getActiveUser().getEmail(); } catch (e) {} }

  let result;
  try {
    const cal = CalendarApp.getCalendarById(id);
    result = cal ? ('OK：' + cal.getName()) : 'NG：null（このアカウントの一覧に無い／編集権限なし）';
  } catch (e) { result = 'NG：' + e; }

  CAL2_say_(
    '【接続チェック】\n\n' +
    '実行アカウント：' + (email || '(取得不可)') + '\n' +
    'mode：' + CAL2_CFG.mode + '（' + m.label + '）\n' +
    'カレンダーID：' + id + '\n\n' +
    '取得結果：' + result + '\n\n' +
    '※「実行アカウント」がこのカレンダーの所有者、または「予定の変更権限」で\n' +
    '　共有されていないと NG になります。'
  );
}

/*************************************************************************
 * 初回セットアップ
 *************************************************************************/
function CAL2_setup() {
  const ss = SpreadsheetApp.getActive();
  const m = CAL2_mode_();
  CAL2_ensureLogAndMapSheets_(ss);
  CAL2_ensureFormatSheet_(ss);

  const sh = ss.getSheetByName(CAL2_CFG.sheetName);
  if (!sh) { CAL2_say_('「' + CAL2_CFG.sheetName + '」シートが見つかりません。'); return; }

  const cols = CAL2_ensureColumns_(sh);
  const miss = CAL2_missingMsg_(cols);
  if (miss.length) { CAL2_say_('次の見出し列が見つかりません：' + miss.join('、') + '\n見出し行に追加してから再実行してください。'); return; }

  CAL2_applyValidations_(sh, cols);
  CAL2_refreshAssigneeList_(sh, cols);

  ScriptApp.getProjectTriggers().forEach(t => {
    const f = t.getHandlerFunction();
    if (f === 'CAL2_onEdit' || f === 'CAL2_onOpen' || f === 'CAL2_reconcileTimed') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('CAL2_onEdit').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('CAL2_onOpen').forSpreadsheet(ss).onOpen().create();
  ScriptApp.newTrigger('CAL2_reconcileTimed').timeBased().everyMinutes(1).create();  // アプリ登録を素早く反映（プログラム書込はonEditが発火しないため）

  try { CAL2_buildMenu_(SpreadsheetApp.getUi()); } catch (_) {}
  try { CAL2_reconcile_(true); } catch (eR) {}

  CAL2_say_(
    '【' + m.label + '】作業カレンダーの初期設定が完了しました。\n\n' +
    '検出した列：担当者=' + CAL2_colLetter_(cols.assignee) +
    ' / 作業日=' + CAL2_colLetter_(cols.workDate) +
    ' / Googleカレンダー=' + CAL2_colLetter_(cols.trigger) + '\n\n' +
    '① CAL2_CFG.calendars に ' + m.label + ' カレンダーIDを貼る\n' +
    '② 担当者マスタ（案件一覧マスター）に職人さんを登録\n' +
    '③ 担当者・作業日を入れて Googleカレンダー(☑) をON'
  );
}

function CAL2_resyncAll() {
  CAL2_reconcile_(true); // ★true＝全予定を強制で作り直す（書式変更・説明文も必ず反映）
  CAL2_say_('同期が完了しました。（詳細は「カレンダー連携ログ」を参照）');
}

function CAL2_refreshAssigneeList() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(CAL2_CFG.sheetName);
  if (!sh) return;
  const cols = CAL2_resolveCols_(sh);
  if (cols.assignee) CAL2_refreshAssigneeList_(sh, cols);
  CAL2_say_('担当者プルダウンをマスタの最新内容で更新しました。');
}

/*************************************************************************
 * onEdit / 時刻トリガー
 *************************************************************************/
function CAL2_onEdit(e) {
  try {
    if (!e || !e.range) return;
    const sh = e.range.getSheet();

    // 「カレンダー書式」タブを編集したら、全予定の説明文を作り直す
    if (sh.getName() === CAL2_CFG.formatSheetName) { CAL2_reconcile_(true); return; }

    if (sh.getName() !== CAL2_CFG.sheetName) return;

    const cols = CAL2_resolveCols_(sh);
    const startCol = e.range.getColumn();
    const endCol = startCol + e.range.getNumColumns() - 1;

    // チェック列が編集されたら「登録者・登録日時」を自動記録。さらにON状態の案件は“強制再同期”の対象にする
    // （チェックを付け直したら、シートの内容でカレンダーを作り直す＝ユーザーの直感に合わせる）
    let forceSet = null;
    if (cols.trigger && startCol <= cols.trigger && cols.trigger <= endCol) {
      CAL2_stampRegistrant_(sh, cols, e);
      forceSet = CAL2_collectCheckedCaseNos_(sh, cols, e);
    }

    // 連絡事項の入力／完了☑で通知
    CAL2_handleNotify_(sh, cols, e);

    const watched = new Set([cols.vendor, cols.propertyName, cols.room, cols.assignee, cols.workDate, cols.workEndDate, cols.trigger, cols.comment].filter(Boolean));
    let hit = false;
    for (let c = startCol; c <= endCol; c++) { if (watched.has(c)) { hit = true; break; } }
    if (!hit) return;

    CAL2_reconcile_(forceSet);
  } catch (err) { console.error('CAL2_onEdit: ' + err); }
}

// チェックONされた行に、編集者メール（取得できれば）と登録日時を記録（空欄のときだけ）
function CAL2_stampRegistrant_(sh, cols, e) {
  let email = '';
  try { email = Session.getActiveUser().getEmail() || ''; } catch (_) {}
  const startRow = e.range.getRow();
  const numRows = e.range.getNumRows();
  const now = new Date();
  for (let r = startRow; r < startRow + numRows; r++) {
    if (r < CAL2_CFG.dataStartRow) continue;
    const checked = sh.getRange(r, cols.trigger).getValue() === true;
    if (!checked) continue;
    if (cols.registeredAt) {
      const cell = sh.getRange(r, cols.registeredAt);
      if (!cell.getValue()) cell.setValue(now).setNumberFormat('yyyy/MM/dd HH:mm');
    }
    if (cols.registrant && email) {
      const cell = sh.getRange(r, cols.registrant);
      if (!cell.getValue()) cell.setValue(email);
    }
  }
}

/** 編集範囲のうち「カレンダー登録☑がON」の行の案件Noを集める（強制再同期の対象） */
function CAL2_collectCheckedCaseNos_(sh, cols, e) {
  const set = new Set();
  if (!cols.trigger || !cols.caseNo) return set;
  const startRow = e.range.getRow();
  const numRows = e.range.getNumRows();
  for (let r = startRow; r < startRow + numRows; r++) {
    if (r < CAL2_CFG.dataStartRow) continue;
    if (sh.getRange(r, cols.trigger).getValue() !== true) continue;
    const cn = String(sh.getRange(r, cols.caseNo).getValue() || '').trim();
    if (cn) set.add(cn);
  }
  return set;
}

/*************************************************************************
 * 通知（連絡事項の入力／完了☑）
 *************************************************************************/
function CAL2_handleNotify_(sh, cols, e) {
  const cfg = CAL2_CFG.notify;
  if (!cfg || !cfg.enabled) return;

  const startCol = e.range.getColumn();
  const endCol = startCol + e.range.getNumColumns() - 1;
  const inRange = (c) => c && startCol <= c && c <= endCol;
  const touchComment = cfg.onComment && inRange(cols.comment);
  const touchDone = cfg.onDone && inRange(cols.done);
  if (!touchComment && !touchDone) return;

  let editor = '';
  try { editor = Session.getActiveUser().getEmail() || ''; } catch (_) {}

  const startRow = e.range.getRow();
  const numRows = e.range.getNumRows();
  for (let r = startRow; r < startRow + numRows; r++) {
    if (r < CAL2_CFG.dataStartRow) continue;

    const caseNo = cols.caseNo ? String(sh.getRange(r, cols.caseNo).getValue() || '').trim() : '';
    const prop = cols.propertyName ? String(sh.getRange(r, cols.propertyName).getValue() || '').trim() : '';
    if (!prop) continue;
    const room = cols.room ? String(sh.getRange(r, cols.room).getValue() || '').trim() : '';
    const assignee = cols.assignee ? String(sh.getRange(r, cols.assignee).getValue() || '').trim() : '';
    const workDate = cols.workDate ? CAL2_cellText_(sh.getRange(r, cols.workDate).getValue()) : '';
    const label = CAL2_mode_().label;
    // 件名用：物件名 号室（区分）　本文用：案件No含む詳細
    const subjId = prop + (room ? ' ' + room : '') + '（' + label + '）';
    const bodyHead =
      '物件: ' + prop + (room ? ' ' + room : '') +
      '\n区分: ' + label +
      (caseNo ? '\n案件No: ' + caseNo : '') +
      '\n担当: ' + (assignee || '-') +
      '\n作業日: ' + (workDate || '-');

    if (touchDone && cols.done && sh.getRange(r, cols.done).getValue() === true) {
      const text = '作業が完了しました。\n\n' + bodyHead + (editor ? '\n操作: ' + editor : '');
      CAL2_sendNotify_('【作業完了】' + subjId, text);
    }

    if (touchComment && cols.comment) {
      const comment = String(sh.getRange(r, cols.comment).getValue() || '').trim();
      if (comment) {
        const text = '連絡事項が入力されました。\n\n' + bodyHead +
          '\n\n内容: ' + comment + (editor ? '\n編集: ' + editor : '');
        CAL2_sendNotify_('【連絡事項】' + subjId, text);
      }
    }
  }
}

function CAL2_sendNotify_(subject, text) {
  const cfg = CAL2_CFG.notify;
  if (cfg.email) {
    try { MailApp.sendEmail(cfg.email, '[作業カレンダー] ' + subject, text); }
    catch (err) { console.error('mail通知: ' + err); }
  }
  if (cfg.lineToken && cfg.lineTo) {
    try {
      UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + cfg.lineToken },
        payload: JSON.stringify({ to: cfg.lineTo, messages: [{ type: 'text', text: text }] }),
        muteHttpExceptions: true,
      });
    } catch (err) { console.error('LINE通知: ' + err); }
  }
}

function CAL2_reconcileTimed() { CAL2_reconcile_(null, true); }  // 毎分の自動同期はSKIPをログに書かない（ログ汚染防止）

/*************************************************************************
 * 同期本体（reconcile）
 *************************************************************************/
function CAL2_reconcile_(forceSet, quiet) {
  const lock = LockService.getDocumentLock();
  if (!lock.tryLock(20000)) return;
  try {
    const ss = SpreadsheetApp.getActive();
    const sh = ss.getSheetByName(CAL2_CFG.sheetName);
    if (!sh) return;
    CAL2_ensureLogAndMapSheets_(ss);

    const cols = CAL2_resolveCols_(sh);
    const miss = CAL2_missingMsg_(cols);
    if (miss.length) { CAL2_log_('ERROR', '', '', '', '必要な見出し列が見つかりません：' + miss.join('、')); return; }

    const master = CAL2_loadMaster_();
    const mapping = CAL2_loadMapping_(ss);
    const fmt = CAL2_loadFormat_(ss);
    const handled = new Set();
    const readCols = Math.max(cols.caseNo, cols.vendor, cols.propertyName, cols.room, cols.address, cols.due, cols.keyInfo, cols.workContent, cols.comment, cols.assignee, cols.workDate, cols.workEndDate, cols.trigger, cols.registrant, cols.registeredAt, cols.lock, cols.orderUrl);

    const lastRow = sh.getLastRow();
    if (lastRow >= CAL2_CFG.dataStartRow) {
      SpreadsheetApp.flush();
      const values = sh.getRange(CAL2_CFG.dataStartRow, 1, lastRow - CAL2_CFG.dataStartRow + 1, readCols).getValues();
      for (let i = 0; i < values.length; i++) {
        const row = values[i];
        const rowNum = CAL2_CFG.dataStartRow + i;
        const checked = row[cols.trigger - 1] === true;
        if (!checked) continue;

        const caseNo = String(row[cols.caseNo - 1] || '').trim();
        if (!caseNo) { if (!quiet) CAL2_log_('SKIP', '', '', '', '案件No未採番（自動採番後に同期されます）行' + rowNum); continue; }
        if (handled.has(caseNo)) { if (!quiet) CAL2_log_('SKIP', caseNo, '', '', '案件No重複（行' + rowNum + '）'); continue; }

        try {
          const spec = CAL2_buildSpec_(row, cols, master, rowNum, fmt);
          if (!spec.ok) { if (!quiet) CAL2_log_('SKIP', caseNo, '', '', spec.message); continue; }

          // 登録日時が空なら補完（★失敗しても同期は止めない）
          if (cols.registeredAt && !row[cols.registeredAt - 1]) {
            try { sh.getRange(rowNum, cols.registeredAt).setValue(new Date()).setNumberFormat('yyyy/MM/dd HH:mm'); } catch (eStamp) {}
          }

          const locked = cols.lock ? (row[cols.lock - 1] === true) : false;
          const force = forceSet === true || !!(forceSet && forceSet.has(caseNo));
          handled.add(caseNo);
          CAL2_upsertEvent_(caseNo, spec, mapping, locked, { sh: sh, rowNum: rowNum, workDateCol: cols.workDate }, force);
        } catch (rowErr) {
          // ★1行の例外で全体を止めない。原因は必ずログに残す。
          handled.add(caseNo); // この案件は削除対象にしない
          CAL2_log_('ERROR', caseNo, '', '', '行' + rowNum + 'の処理でエラー: ' + (rowErr && rowErr.message ? rowErr.message : rowErr));
        }
      }
    }

    // ★アプリ用DB(cl_cases)へ相乗り同期。☑編集・一括同期のとき（毎分の自動チェックでは走らせない）。
    //   失敗してもカレンダー同期は止めない。
    if (!quiet) {
      try { CAL2_pushCasesToApp_(sh, cols); }
      catch (e) { CAL2_log_('ERROR', '', '', '', 'cl_cases同期: ' + (e && e.message ? e.message : e)); }
    }

    const toDelete = [];
    mapping.forEach((rec, caseNo) => { if (!handled.has(caseNo)) toDelete.push([caseNo, rec]); });
    toDelete.forEach(([caseNo, rec]) => CAL2_deleteEvent_(caseNo, rec, mapping));
  } catch (err) {
    console.error('CAL2_reconcile_: ' + err);
    // ★全体例外もシートのログに必ず残す（原因が見えるように）
    try { CAL2_log_('ERROR', '', '', '', 'reconcile全体で例外: ' + (err && err.message ? err.message : err)); } catch (_) {}
  } finally {
    lock.releaseLock();
  }
}

/*************************************************************************
 * アプリ用DB（Supabase cl_cases）へ upsert 同期
 *   ・Googleカレンダー☑ON かつ 案件Noが ad- で始まる行だけ対象。
 *   ・カレンダー同期に相乗り（reconcileから呼ばれる）。手動なら直接この関数を▶実行してもOK。
 *************************************************************************/
function CAL2_pushCasesToApp_(sh, cols) {
  const cfg = CAL2_CFG.supabase;
  if (!cfg || !cfg.url || !cfg.anonKey) return;

  const ss = SpreadsheetApp.getActive();
  if (!sh) sh = ss.getSheetByName(CAL2_CFG.sheetName);
  if (!sh) return;
  if (!cols) cols = CAL2_resolveCols_(sh);
  if (!cols.caseNo || !cols.trigger) return;

  const kbn = CAL2_mode_().calendarKey; // 'seisou' / 'naiso'
  const lastRow = sh.getLastRow();
  if (lastRow < CAL2_CFG.dataStartRow) return;

  const readCols = Math.max(cols.caseNo, cols.vendor, cols.propertyName, cols.room,
                            cols.assignee, cols.workDate, cols.due, cols.workContent, cols.trigger);
  const vals = sh.getRange(CAL2_CFG.dataStartRow, 1, lastRow - CAL2_CFG.dataStartRow + 1, readCols).getValues();

  const rows = [];
  for (let i = 0; i < vals.length; i++) {
    const row = vals[i];
    if (row[cols.trigger - 1] !== true) continue;              // ☑ON行だけ
    const cn = String(row[cols.caseNo - 1] || '').trim();
    if (cn.indexOf('ad-') !== 0) continue;

    const wd = cols.workDate ? row[cols.workDate - 1] : null;
    const ws = (wd && wd.getTime && !isNaN(wd.getTime()))
      ? Utilities.formatDate(wd, CAL2_CFG.tz, 'yyyy/MM/dd') : null;

    rows.push({
      case_no: cn,
      kbn: kbn,
      vendor: cols.vendor ? String(row[cols.vendor - 1] || '') : '',
      prop:   cols.propertyName ? String(row[cols.propertyName - 1] || '') : '',
      room:   cols.room ? String(row[cols.room - 1] || '') : '',
      staff:  cols.assignee ? String(row[cols.assignee - 1] || '') : '',
      work_date: ws,
      due:    cols.due ? String(row[cols.due - 1] || '') : '',
      work_content: cols.workContent ? String(row[cols.workContent - 1] || '') : ''
    });
  }
  if (!rows.length) return;

  // 同じ案件が清掃/内装の両方にある(case_no重複)ときのため、案件Noで重複排除（1pushは単一区分なので実質 case_no+kbn）
  const __seen = {}; rows.forEach(function(r){ __seen[r.case_no] = r; }); rows = Object.keys(__seen).map(function(k){ return __seen[k]; });
  // 主キー(case_no, kbn)で区分別にupsertするため on_conflict を明示
  const URL = cfg.url.replace(/\/+$/, '') + '/rest/v1/' + (cfg.casesTable || 'cl_cases') + '?on_conflict=case_no,kbn';
  for (let j = 0; j < rows.length; j += 150) {
    const chunk = rows.slice(j, j + 150);
    const res = UrlFetchApp.fetch(URL, {
      method: 'post',
      contentType: 'application/json',
      headers: { apikey: cfg.anonKey, Prefer: 'resolution=merge-duplicates,return=minimal' },
      payload: JSON.stringify(chunk),
      muteHttpExceptions: true
    });
    if (res.getResponseCode() >= 300) {
      CAL2_log_('ERROR', '', '', '', 'cl_cases ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 200));
      return;
    }
  }
  CAL2_log_('SYNC', '', '', '', 'cl_cases 同期 ' + rows.length + '件');
}

/*************************************************************************
 * 1行 → イベント仕様
 *************************************************************************/
function CAL2_buildSpec_(row, cols, master, rowNum, fmt) {
  const m = CAL2_mode_();
  const calendarId = CAL2_CFG.calendars[m.calendarKey];
  if (!calendarId) return { ok: false, message: '【' + m.label + '】用のカレンダーID未設定' };

  const caseNo = cols.caseNo ? String(row[cols.caseNo - 1] || '').trim() : '';
  const propertyName = CAL2_cellText_(row[cols.propertyName - 1]);
  if (!propertyName) return { ok: false, message: '物件名が未入力（行' + rowNum + '）' };
  const room = cols.room ? CAL2_cellText_(row[cols.room - 1]) : '';
  const vendor = cols.vendor ? CAL2_cellText_(row[cols.vendor - 1]) : '';
  const address = cols.address ? CAL2_cellText_(row[cols.address - 1]) : '';
  const due = cols.due ? CAL2_cellText_(row[cols.due - 1]) : '';
  const keyInfo = cols.keyInfo ? CAL2_cellText_(row[cols.keyInfo - 1]) : '';
  const workContent = cols.workContent ? CAL2_cellText_(row[cols.workContent - 1]) : '';
  const comment = cols.comment ? CAL2_cellText_(row[cols.comment - 1]) : '';
  const registrant = cols.registrant ? String(row[cols.registrant - 1] || '').trim() : '';
  const registeredAt = cols.registeredAt ? row[cols.registeredAt - 1] : '';
  const orderUrl = cols.orderUrl ? String(row[cols.orderUrl - 1] || '').trim() : '';

  const dt = CAL2_parseDate_(row[cols.workDate - 1]);
  if (!dt) return { ok: false, message: '作業日が未入力/不正のため未同期（行' + rowNum + '）' };
  const endDt = cols.workEndDate ? CAL2_parseDate_(row[cols.workEndDate - 1]) : null;

  // 担当者は複数人OK（「、」「/」「・」等で区切り）。全員をゲスト招待し、色は最初の人を使う
  const assigneeNames = CAL2_splitNames_(row[cols.assignee - 1]);
  const guestEmails = [];
  let colorSrc = '';
  assigneeNames.forEach(function (nm) {
    const m2 = master[CAL2_normalizeName_(nm)];
    if (m2 && m2.email && guestEmails.indexOf(m2.email) === -1) guestEmails.push(m2.email);
    if (!colorSrc && m2 && m2.color) colorSrc = m2.color;
  });
  const assigneeName = assigneeNames.join('・');
  const colorId = CAL2_resolveColor_(colorSrc);
  const { allDay, multiDay, start, end } = CAL2_buildTime_(dt, endDt);

  let title = (assigneeName ? '[' + assigneeName + '] ' : '') + propertyName + (room ? ' ' + room : '');
  if (vendor) title += '【' + vendor + '】';

  const description = CAL2_buildDescription_({
    m, caseNo, propertyName, room, address, due, keyInfo, workContent, comment, dt, endDt, assigneeName,
    registrant, registeredAt, orderUrl,
    sheetUrl: SpreadsheetApp.getActive().getUrl(),
  }, fmt);
  return { ok: true, mode: m, calendarId, title, description, location: address, allDay, multiDay, start, end, guestEmails, colorId };
}

/**
 * カレンダー説明文のテンプレート（「カレンダー書式」タブ駆動）
 *  ・fmt（書式タブの表示ON行）があれば、それ“だけ”を出す＝SSが唯一の管理元。
 *    タブに書いていない項目は一切入れない（空配列なら本文なし）。
 *  ・fmt が null（＝書式タブ自体が存在しない）ときだけ、既定テンプレートにフォールバック。
 *  ・作業に必要な項目のみ（金額は入れない）。説明文は文字色不可のため絵文字で強調。
 */
function CAL2_buildDescription_(o, fmt) {
  const rows = fmt ? fmt : CAL2_defaultFormat_();  // ★書式タブがある限り、その内容だけを使う
  const lines = [];
  for (const r of rows) {
    if (r.field === '空行') { lines.push(''); continue; }
    if (r.field === '自由文') { lines.push((r.emoji || '') + (r.label || '')); continue; }
    if (r.field === '作業内容') {
      lines.push((r.emoji || '') + (r.label || '作業内容'));
      const items = CAL2_splitWorkItems_(o.workContent);
      if (items.length) items.forEach(it => lines.push('☐ ' + it));
      else {
        const cl = CAL2_CFG.checklists[o.m.checklistKey] || [];
        if (cl.length) cl.forEach(it => lines.push('☐ ' + it));
        else lines.push('　（記載なし）');
      }
      continue;
    }
    const val = CAL2_fieldValue_(r.field, o);
    lines.push((r.emoji || '') + (r.label || '') + '：' + (val || '-'));
  }
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '');
}

function CAL2_fieldValue_(field, o) {
  switch (String(field || '').trim()) {
    case '物件名号室': return o.propertyName + (o.room ? ' ' + o.room : '');
    case '物件名': return o.propertyName;
    case '住所': return o.address;
    case '納期': return o.due;
    case '作業日': {
      const s = Utilities.formatDate(o.dt, CAL2_CFG.tz, 'yyyy/MM/dd');
      if (o.endDt && CAL2_stripTime_(o.endDt).getTime() > CAL2_stripTime_(o.dt).getTime()) {
        return s + '〜' + Utilities.formatDate(o.endDt, CAL2_CFG.tz, 'yyyy/MM/dd');
      }
      return s;
    }
    case '担当者': return o.assigneeName;
    case '受注先': return o.vendor;
    case '鍵情報': return o.keyInfo;
    case '連絡事項': return o.comment;
    case '発注書リンク': return o.orderUrl;
    case '開始連絡リンク': {
      const base = CAL2_CFG.startLinkBase;
      if (!base) return '';
      // t=区分(seisou/naiso) を付けて、報告側が正しいシートの担当者を引けるようにする
      return base + (base.indexOf('?') >= 0 ? '&' : '?') + 'action=start&case=' + encodeURIComponent(o.caseNo || '') + '&t=' + CAL2_CFG.mode;
    }
    case '報告リンク': {
      const tpl = CAL2_CFG.reportForm && CAL2_CFG.reportForm.prefillTemplate;
      if (!tpl) return '';
      // 案件No・物件名・担当者を自動入力。
      // ※ごく稀に日本語が文字化けすることがあるが、RPT側の自動デコードで通知は正しく表示される。
      //   完全に化けを無くしたい場合は __PROP__/__REPORTER__ を '' に変えて案件Noのみにする。
      return tpl
        .replace('__CASE__', encodeURIComponent(o.caseNo || ''))
        .replace('__PROP__', encodeURIComponent((o.propertyName || '') + (o.room ? ' ' + o.room : '')))
        .replace('__REPORTER__', encodeURIComponent(o.assigneeName || ''));
    }
    case '作業チェックリンク': {
      const base = CAL2_CFG.checklistBase;
      if (!base) return '';
      return base + (base.indexOf('?') >= 0 ? '&' : '?') + 'view=checklist&case=' + encodeURIComponent(o.caseNo || '') + '&kbn=' + CAL2_mode_().calendarKey;
    }
    case '登録者': return o.registrant;
    case '登録日時': return o.registeredAt ? (o.registeredAt instanceof Date ? Utilities.formatDate(o.registeredAt, CAL2_CFG.tz, 'yyyy/MM/dd HH:mm') : String(o.registeredAt)) : '';
    default: return '';
  }
}

// 既定書式：★「カレンダー書式」タブが“存在しない”極端な場合のみ使う保険。
//   通常はタブが唯一の管理元。ここにはチェックリンク等の自動挿入行は置かない。
function CAL2_defaultFormat_() {
  return [
    { emoji: '⭐', label: '案件名',          field: '物件名号室' },
    { emoji: '📍', label: '住所',            field: '住所' },
    { emoji: '🗓', label: '納期',            field: '納期' },
    { emoji: '🛠', label: '作業日',          field: '作業日' },
    { emoji: '👤', label: '担当者',          field: '担当者' },
    { emoji: '',   label: '',                field: '空行' },
    { emoji: '🔑', label: '解錠方法・鍵の開け方', field: '鍵情報' },
    { emoji: '',   label: '',                field: '空行' },
    { emoji: '✅', label: '作業内容（発注書）',   field: '作業内容' },
    { emoji: '',   label: '',                field: '空行' },
    { emoji: '💬', label: '連絡事項',          field: '連絡事項' },
  ];
}

function CAL2_splitWorkItems_(s) {
  const t = String(s || '').trim();
  if (!t) return [];
  return t.split(/\s*[\/／、,，\n・]\s*/).map(x => x.trim()).filter(Boolean);
}

/*************************************************************************
 * カレンダー書式タブ（説明文テンプレートの編集用）
 *************************************************************************/
// 戻り値の意味：
//   null … 「カレンダー書式」タブ自体が無い（→ 既定書式にフォールバック）
//   []   … タブはあるが表示ON行が無い（→ 本文なし。SSの指示どおり“何も入れない”）
//   配列 … 表示ONの行だけを、書いた順にそのまま使う
function CAL2_loadFormat_(ss) {
  const sh = ss.getSheetByName(CAL2_CFG.formatSheetName);
  if (!sh) return null;          // ★タブが無いときだけ既定書式に頼る
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];     // ★タブはあるが空 → 「何も出さない」を正とする
  const vals = sh.getRange(2, 1, lastRow - 1, 4).getValues();
  const rows = [];
  for (const v of vals) {
    const show = v[0] === true || String(v[0]).toUpperCase() === 'TRUE';
    if (!show) continue;
    const emoji = String(v[1] || '');
    const label = String(v[2] || '');
    const field = String(v[3] || '').trim();
    if (!emoji && !label && !field) continue;
    rows.push({ emoji, label, field });
  }
  return rows;                     // ★表示ONの行だけ（0件なら []＝本文なし）
}

function CAL2_ensureFormatSheet_(ss) {
  let sh = ss.getSheetByName(CAL2_CFG.formatSheetName);
  if (!sh) {
    sh = ss.insertSheet(CAL2_CFG.formatSheetName);
    sh.getRange(1, 1, 1, 4).setValues([['表示', '絵文字', 'ラベル', '差込項目']])
      .setFontWeight('bold').setBackground('#f3f3f3');
    const def = CAL2_defaultFormat_();
    const rows = def.map(d => [true, d.emoji, d.label, d.field]);
    sh.getRange(2, 1, rows.length, 4).setValues(rows);
    sh.setColumnWidth(1, 50); sh.setColumnWidth(2, 70); sh.setColumnWidth(3, 200); sh.setColumnWidth(4, 140);
    sh.getRange('F1').setValue('行を上下に動かすと順番が変わります。チェックを外すと非表示。ここに書いた行“だけ”が予定に入ります。保存すると全予定が自動更新されます。');
  }
  // ★方針：書式タブへの“自動行追加”はしない（SSに書いたものだけを出すため）。
  //   必要な差込項目（報告リンク/チェックリンク等）は、このタブに手で1行足してください。

  // 体裁（表示=チェックボックス / 差込項目=プルダウン）
  const maxRows = Math.max(sh.getMaxRows(), 2);
  sh.getRange(2, 1, maxRows - 1, 1).setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().build());
  sh.getRange(2, 4, maxRows - 1, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(CAL2_CFG.fieldOptions, true).setAllowInvalid(true).build());
  return sh;
}

/*************************************************************************
 * イベント作成/更新/削除
 *************************************************************************/
function CAL2_upsertEvent_(caseNo, spec, mapping, locked, rev, force) {
  const sig = CAL2_signature_(spec);
  const rec = mapping.get(caseNo);

  // カレンダーが変わっていたら旧予定を削除（後段で作り直す）
  if (rec && rec.eventId && rec.calendarId && rec.calendarId !== spec.calendarId) {
    CAL2_deleteEventRaw_(rec.calendarId, rec.eventId);
    rec.eventId = '';
  }

  let ev = (rec && rec.eventId) ? CAL2_getEventByIdSafely_(spec.calendarId, rec.eventId) : null;

  // ★同期＝シートが正。カレンダーで手動削除(cancelled)された予定は「無い」扱いにして必ず作り直す。
  if (ev && CAL2_isDeleted_(spec.calendarId, rec.eventId)) ev = null;

  // ① 作業日の逆同期：カレンダーで予定の日付が動いていたら、シートの作業日に反映
  //   （ロック中／またはシートが前回から変わっていない＝カレンダー側が動いた、とき）
  if (!force && ev && rev && rev.workDateCol) {
    try {
      const evStart = CAL2_stripTime_(ev.isAllDayEvent() ? ev.getAllDayStartDate() : ev.getStartTime());
      const sheetStart = CAL2_stripTime_(spec.start);
      if (evStart.getTime() !== sheetStart.getTime() && (locked || (rec && rec.sig === sig))) {
        rev.sh.getRange(rev.rowNum, rev.workDateCol).setValue(evStart).setNumberFormat('yyyy/MM/dd');
        CAL2_log_('PULL', caseNo, spec.calendarId, rec.eventId, 'カレンダーの日付をシートに反映: ' + Utilities.formatDate(evStart, CAL2_CFG.tz, 'yyyy/MM/dd'));
        return;
      }
    } catch (e) { console.warn('reverse-sync: ' + e); }
  }

  // ② ロック中：既存予定は上書きしない（カレンダーの微調整を保護）。
  //    ※force(チェック付け直し)でも“ロックは最優先で尊重”。更新したい時は先にロックを外す。
  if (locked && ev) return;

  // ③ 変更がなければスキップ。ただし強制再同期(force)＝チェック付け直し時は必ず作り直す
  if (!force && rec && rec.sig === sig && ev) return;

  const cal = CAL2_getCalendarByIdSafely_(spec.calendarId);
  if (!cal) { CAL2_log_('ERROR', caseNo, spec.calendarId, '', 'カレンダーにアクセスできません（ID/権限を確認）'); return; }

  if (ev && ev.isAllDayEvent() !== spec.allDay) { try { ev.deleteEvent(); } catch (e) {} ev = null; }

  let action;
  if (!ev) { ev = CAL2_createEvent_(cal, spec); action = 'CREATE'; }
  else {
    ev.setTitle(spec.title);
    ev.setDescription(spec.description);
    if (spec.allDay && spec.multiDay) ev.setAllDayDates(CAL2_stripTime_(spec.start), spec.end);
    else if (spec.allDay) ev.setAllDayDate(CAL2_stripTime_(spec.start));
    else ev.setTime(spec.start, spec.end);
    try { ev.setLocation(spec.location || ''); } catch (_) {}
    CAL2_applyGuests_(ev, spec.guestEmails);
    CAL2_applyColor_(ev, spec.colorId);
    action = 'UPDATE';
  }

  const eventId = ev.getId();
  CAL2_writeMapping_(mapping, caseNo, { calendarId: spec.calendarId, eventId, title: spec.title, start: spec.start, allDay: spec.allDay, sig });
  CAL2_log_(action, caseNo, spec.calendarId, eventId,
    (action === 'CREATE' ? '作成' : '更新') + 'しました' + ((spec.guestEmails && spec.guestEmails.length) ? '（招待: ' + spec.guestEmails.join(', ') + '）' : ''));
}

function CAL2_createEvent_(cal, spec) {
  const opts = {};
  if (spec.guestEmails && spec.guestEmails.length) { opts.guests = spec.guestEmails.join(','); opts.sendInvites = true; }
  if (spec.location) opts.location = spec.location;
  let ev;
  if (spec.allDay && spec.multiDay) ev = cal.createAllDayEvent(spec.title, CAL2_stripTime_(spec.start), spec.end, opts);
  else if (spec.allDay) ev = cal.createAllDayEvent(spec.title, CAL2_stripTime_(spec.start), opts);
  else ev = cal.createEvent(spec.title, spec.start, spec.end, opts);
  ev.setDescription(spec.description);
  CAL2_applyColor_(ev, spec.colorId);
  return ev;
}

function CAL2_applyGuests_(ev, guestEmails) {
  try {
    const desired = (guestEmails || []).map(e => String(e).toLowerCase());
    const current = ev.getGuestList().map(g => String(g.getEmail()).toLowerCase());
    desired.forEach(em => { if (current.indexOf(em) === -1) ev.addGuest(em); });
    current.forEach(em => { if (desired.indexOf(em) === -1) { try { ev.removeGuest(em); } catch (_) {} } });
  } catch (err) { console.warn('guests: ' + err); }
}

function CAL2_applyColor_(ev, colorId) { if (!colorId) return; try { ev.setColor(colorId); } catch (err) { console.warn('color: ' + err); } }

function CAL2_deleteEvent_(caseNo, rec, mapping) {
  const ok = (rec.calendarId && rec.eventId) ? CAL2_deleteEventRaw_(rec.calendarId, rec.eventId) : false;
  CAL2_removeMapping_(mapping, caseNo);
  CAL2_log_('DELETE', caseNo, rec.calendarId || '', rec.eventId || '',
    rec.eventId ? (ok ? '削除しました' : 'イベントが見つからず紐付けのみ削除') : '紐付けのみ削除');
}

/*************************************************************************
 * 時刻・署名
 *************************************************************************/
function CAL2_buildTime_(dt, endDt) {
  // 終了日があり、開始日より後 → 複数日にまたがる終日イベント
  if (endDt) {
    const s = CAL2_stripTime_(dt);
    const e = CAL2_stripTime_(endDt);
    if (e.getTime() > s.getTime()) {
      // Googleの終日イベントは終了日が「翌日＝排他」なので +1 日
      const endExclusive = new Date(e.getFullYear(), e.getMonth(), e.getDate() + 1);
      return { allDay: true, multiDay: true, start: s, end: endExclusive };
    }
  }
  // 単日（従来）
  const start = new Date(dt);
  const isMidnight = start.getHours() === 0 && start.getMinutes() === 0 && start.getSeconds() === 0 && start.getMilliseconds() === 0;
  const allDay = CAL2_CFG.allDayIfMidnight ? isMidnight : false;
  if (allDay) return { allDay: true, multiDay: false, start: CAL2_stripTime_(start), end: null };
  const end = new Date(start.getTime() + CAL2_CFG.defaultDurationMinutes * 60 * 1000);
  return { allDay: false, multiDay: false, start, end };
}

function CAL2_signature_(spec) {
  let startKey = spec.allDay
    ? Utilities.formatDate(CAL2_stripTime_(spec.start), CAL2_CFG.tz, 'yyyy-MM-dd') + '|allday'
    : Utilities.formatDate(spec.start, CAL2_CFG.tz, 'yyyy-MM-dd HH:mm');
  if (spec.multiDay && spec.end) startKey += '~' + Utilities.formatDate(spec.end, CAL2_CFG.tz, 'yyyy-MM-dd');
  return CAL2_sha256_([spec.calendarId, spec.title, startKey, (spec.guestEmails || []).join(','), spec.colorId || '', spec.location || '', spec.description].join('||'));
}

/*************************************************************************
 * 担当者マスタ
 *************************************************************************/
function CAL2_loadMaster_() {
  const map = {};
  try {
    const ss = SpreadsheetApp.openById(CAL2_CFG.masterSpreadsheetId);
    const sh = ss.getSheetByName(CAL2_CFG.masterSheetName);
    if (!sh) return map;
    const lastRow = sh.getLastRow();
    if (lastRow < 2) return map;
    const vals = sh.getRange(2, 1, lastRow - 1, 3).getValues();
    const mc = CAL2_CFG.masterCol;
    for (let i = 0; i < vals.length; i++) {
      const name = String(vals[i][mc.name - 1] || '').trim();
      if (!name) continue;
      map[CAL2_normalizeName_(name)] = {
        rawName: name,
        email: String(vals[i][mc.email - 1] || '').trim(),
        color: String(vals[i][mc.color - 1] || '').trim(),
      };
    }
  } catch (err) { console.error('CAL2_loadMaster_: ' + err); }
  return map;
}

function CAL2_refreshAssigneeList_(sh, cols) {
  try {
    if (!cols.assignee) return;
    const master = CAL2_loadMaster_();
    const names = Object.keys(master).map(k => master[k].rawName).filter(Boolean);
    const maxRows = sh.getMaxRows();
    if (maxRows < CAL2_CFG.dataStartRow) return;
    const rng = sh.getRange(CAL2_CFG.dataStartRow, cols.assignee, maxRows - CAL2_CFG.dataStartRow + 1, 1);
    if (names.length) {
      rng.setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(names, true).setAllowInvalid(true).build());
    }
  } catch (err) { console.warn('refreshAssigneeList: ' + err); }
}

function CAL2_normalizeName_(s) { return String(s || '').replace(/[\s　]/g, ''); }

// 担当者セルを複数名に分割（区切りは 、 , ， / ／ ・ 改行。氏名内の空白は保持）
function CAL2_splitNames_(v) {
  return String(v == null ? '' : v).split(/[、,，\/／・\n]+/).map(function (x) { return x.trim(); }).filter(function (x) { return x; });
}

function CAL2_resolveColor_(colorText) {
  const name = CAL2_CFG.colorMap[String(colorText || '').trim()];
  if (!name) return '';
  try { return CalendarApp.EventColor[name]; } catch (_) { return ''; }
}

/*************************************************************************
 * 体裁（検出した列に入力規則を設定）
 *************************************************************************/
function CAL2_applyValidations_(sh, cols) {
  const maxRows = sh.getMaxRows();
  if (maxRows < CAL2_CFG.dataStartRow) return;
  const n = maxRows - CAL2_CFG.dataStartRow + 1;

  if (cols.workDate) {
    sh.getRange(CAL2_CFG.dataStartRow, cols.workDate, n, 1)
      .setNumberFormat('yyyy/MM/dd')
      .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false)
        .setHelpText('セルをダブルクリックで日付を選べます').build());
  }
  if (cols.workEndDate) {
    sh.getRange(CAL2_CFG.dataStartRow, cols.workEndDate, n, 1)
      .setNumberFormat('yyyy/MM/dd')
      .setDataValidation(SpreadsheetApp.newDataValidation().requireDate().setAllowInvalid(false)
        .setHelpText('数日かかる場合のみ終了日を入れる（空なら1日）').build());
  }
  if (cols.trigger) {
    sh.getRange(CAL2_CFG.dataStartRow, cols.trigger, n, 1)
      .setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().setAllowInvalid(false).build());
  }
  if (cols.done) {
    sh.getRange(CAL2_CFG.dataStartRow, cols.done, n, 1)
      .setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().setAllowInvalid(false).build());
  }
  if (cols.lock) {
    sh.getRange(CAL2_CFG.dataStartRow, cols.lock, n, 1)
      .setDataValidation(SpreadsheetApp.newDataValidation().requireCheckbox().setAllowInvalid(false).build());
  }
  // 連絡事項：よく使う文をプルダウン化（自由入力も可）
  if (cols.comment && CAL2_CFG.commentPresets && CAL2_CFG.commentPresets.length) {
    sh.getRange(CAL2_CFG.dataStartRow, cols.comment, n, 1)
      .setDataValidation(SpreadsheetApp.newDataValidation()
        .requireValueInList(CAL2_CFG.commentPresets, true).setAllowInvalid(true).build());
  }
}

/*************************************************************************
 * ログ／紐付け
 *************************************************************************/
function CAL2_ensureLogAndMapSheets_(ss) {
  if (!ss.getSheetByName(CAL2_CFG.logSheetName)) {
    ss.insertSheet(CAL2_CFG.logSheetName).appendRow(['timestamp', 'action', '案件No', 'calendarId', 'eventId', 'message']);
  }
  if (!ss.getSheetByName(CAL2_CFG.mapSheetName)) {
    ss.insertSheet(CAL2_CFG.mapSheetName).appendRow(['案件No', 'calendarId', 'eventId', 'title', 'start', 'allDay', 'sig', 'updatedAt']);
  }
}

function CAL2_loadMapping_(ss) {
  const sh = ss.getSheetByName(CAL2_CFG.mapSheetName);
  const map = new Map();
  if (!sh) return map;
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return map;
  const vals = sh.getRange(2, 1, lastRow - 1, 8).getValues();
  for (let i = 0; i < vals.length; i++) {
    const caseNo = String(vals[i][0] || '').trim();
    if (!caseNo) continue;
    map.set(caseNo, { rowIndex: i + 2, calendarId: String(vals[i][1] || ''), eventId: String(vals[i][2] || ''), sig: String(vals[i][6] || '') });
  }
  return map;
}

function CAL2_writeMapping_(mapping, caseNo, data) {
  const sh = SpreadsheetApp.getActive().getSheetByName(CAL2_CFG.mapSheetName);
  const startStr = Utilities.formatDate(data.start, CAL2_CFG.tz, 'yyyy/MM/dd HH:mm');
  const now = Utilities.formatDate(new Date(), CAL2_CFG.tz, 'yyyy/MM/dd HH:mm:ss');
  const record = [caseNo, data.calendarId, data.eventId, data.title, startStr, data.allDay ? 'TRUE' : 'FALSE', data.sig, now];
  const existing = mapping.get(caseNo);
  if (existing && existing.rowIndex) sh.getRange(existing.rowIndex, 1, 1, record.length).setValues([record]);
  else sh.appendRow(record);
  mapping.set(caseNo, { rowIndex: existing ? existing.rowIndex : sh.getLastRow(), calendarId: data.calendarId, eventId: data.eventId, sig: data.sig });
}

function CAL2_removeMapping_(mapping, caseNo) {
  const sh = SpreadsheetApp.getActive().getSheetByName(CAL2_CFG.mapSheetName);
  if (sh) {
    const cell = sh.createTextFinder(caseNo).matchEntireCell(true).findNext();
    if (cell && cell.getColumn() === 1) sh.deleteRow(cell.getRow());
  }
  mapping.delete(caseNo);
}

function CAL2_log_(action, caseNo, calendarId, eventId, message) {
  try {
    const sh = SpreadsheetApp.getActive().getSheetByName(CAL2_CFG.logSheetName);
    if (!sh) return;
    sh.appendRow([Utilities.formatDate(new Date(), CAL2_CFG.tz, 'yyyy/MM/dd HH:mm:ss'), action, caseNo, calendarId || '', eventId || '', message || '']);
  } catch (err) { console.error('log: ' + err); }
}

/*************************************************************************
 * カレンダー取得・ユーティリティ
 *************************************************************************/
function CAL2_getCalendarByIdSafely_(calendarId) {
  if (!calendarId) return null;
  try { return CalendarApp.getCalendarById(calendarId); } catch (err) { console.error(err); return null; }
}
function CAL2_getEventByIdSafely_(calendarId, eventId) {
  if (!calendarId || !eventId) return null;
  try { const cal = CAL2_getCalendarByIdSafely_(calendarId); return cal ? cal.getEventById(eventId) : null; }
  catch (err) { console.error(err); return null; }
}

// カレンダーで手動削除された予定を検知（高度サービス Calendar が有効なとき status を見る）。
//   削除済み(cancelled)なら true → 呼び出し側で「無い」扱いにして作り直す。
//   ※高度サービス未有効なら false（従来動作）。有効化: エディタ左「サービス(＋)」→ Calendar API → 追加。
function CAL2_isDeleted_(calendarId, eventId) {
  try {
    if (typeof Calendar === 'undefined' || !Calendar.Events) return false;
    const id = String(eventId || '').replace(/@.*$/, '');
    if (!id) return false;
    const ev = Calendar.Events.get(calendarId, id);
    return !ev || ev.status === 'cancelled';
  } catch (e) {
    return false; // 取得できない時は安全側（作り直さない）
  }
}
function CAL2_deleteEventRaw_(calendarId, eventId) {
  try { const ev = CAL2_getEventByIdSafely_(calendarId, eventId); if (!ev) return false; ev.deleteEvent(); return true; }
  catch (err) { console.error(err); return false; }
}
function CAL2_stripTime_(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

// セルの値を表示用テキストに：日付型は yyyy/MM/dd（時刻あれば+HH:mm）、それ以外は文字列のまま
function CAL2_cellText_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) {
    const hasTime = v.getHours() || v.getMinutes() || v.getSeconds();
    return Utilities.formatDate(v, CAL2_CFG.tz, hasTime ? 'yyyy/MM/dd HH:mm' : 'yyyy/MM/dd');
  }
  return String(v == null ? '' : v).trim();
}
function CAL2_colLetter_(col) {
  let s = '', n = col;
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s || '?';
}
function CAL2_parseDate_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return v;
  if (typeof v === 'number' && isFinite(v)) { const d = new Date(v); if (!isNaN(d.getTime())) return d; }
  const s = String(v || '').trim();
  if (!s) return null;
  const d0 = new Date(s);
  if (!isNaN(d0.getTime())) return d0;
  const patterns = ['yyyy/MM/dd H:mm:ss', 'yyyy/MM/dd H:mm', 'yyyy-MM-dd H:mm:ss', 'yyyy-MM-dd H:mm', 'yyyy/MM/dd', 'yyyy-MM-dd'];
  for (const p of patterns) { try { const d = Utilities.parseDate(s, CAL2_CFG.tz, p); if (d && !isNaN(d.getTime())) return d; } catch (_) {} }
  return null;
}
function CAL2_sha256_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(b => { const v = (b < 0 ? b + 256 : b).toString(16); return v.length === 1 ? '0' + v : v; }).join('');
}
