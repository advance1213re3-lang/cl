/**
 * ============================================================
 *  案件管理 → Supabase cl_cases 同期（チェックリスト「案件無し」解消用）
 * ============================================================
 *  使い方：
 *   1) 内装SS・清掃SS それぞれの Apps Script で「＋」→「スクリプト」で
 *      新規ファイルを作り、この内容を丸ごと貼り付けて保存。
 *      （本体の CAL2 コードは既にあるので触らない。これは追加ファイル）
 *   2) 関数リストから  syncCasesToSupabase  を選んで ▶実行（各SSで1回ずつ）。
 *   3) 実行ログに「cl_cases 同期完了: kbn=... / N件」が出れば成功。
 *
 *  ・kbn（naiso/seisou）は同プロジェクトの CAL2_CFG.mode から自動判定。
 *    もし自動で拾えない場合は下の KBN_OVERRIDE に 'naiso' か 'seisou' を直書き。
 *  ・apikey は公開用の匿名キー（アプリに埋め込み済みのもの）。
 * ============================================================
 */

var KBN_OVERRIDE = '';  // 例: 'naiso' / 'seisou'（空なら CAL2_CFG.mode を使う）

function syncCasesToSupabase() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('案件管理');
  if (!sh) { Logger.log('「案件管理」シートが見つかりません'); return; }

  var kbn = KBN_OVERRIDE
    || ((typeof CAL2_CFG !== 'undefined' && CAL2_CFG.mode) ? CAL2_CFG.mode : 'naiso');

  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmcmVlaGhlbm13cmJ4a2hjZHZ1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NTE5NTAsImV4cCI6MjA5OTUyNzk1MH0.UQKIOeJmn0Yt6gqUC_TF0uoFiRl4poTJyv_tx6BotS8';
  var URL = 'https://vfreehhenmwrbxkhcdvu.supabase.co/rest/v1/cl_cases';

  var last = sh.getLastRow();
  var lastCol = sh.getLastColumn();
  var data = sh.getRange(1, 1, last, lastCol).getValues();

  var hdr = data[0].map(function (h) { return String(h).trim(); });
  function col(names) {
    for (var i = 0; i < hdr.length; i++) {
      for (var j = 0; j < names.length; j++) {
        if (hdr[i].indexOf(names[j]) >= 0) return i;
      }
    }
    return -1;
  }

  var ci = {
    cn: col(['案件No', '案件NO']),
    ve: col(['受注先', '業者']),
    pr: col(['物件名']),
    rm: col(['号室', '部屋番号']),
    st: col(['担当者']),
    wd: col(['作業日']),
    du: col(['納期']),
    wc: col(['作業項目', '作業内容'])
  };
  if (ci.cn < 0) { Logger.log('「案件No」列が見つかりません（1行目の見出しを確認）'); return; }

  var rows = [];
  for (var r = 1; r < data.length; r++) {
    var cn = String(data[r][ci.cn] || '').trim();
    if (cn.indexOf('ad-') !== 0) continue;

    var w = data[r][ci.wd];
    var ws = null;
    if (w && w.getTime && !isNaN(w.getTime())) {
      ws = Utilities.formatDate(w, 'Asia/Tokyo', 'yyyy/MM/dd');
    }

    rows.push({
      case_no: cn,
      kbn: kbn,
      vendor: ci.ve >= 0 ? String(data[r][ci.ve] || '') : '',
      prop:   ci.pr >= 0 ? String(data[r][ci.pr] || '') : '',
      room:   ci.rm >= 0 ? String(data[r][ci.rm] || '') : '',
      staff:  ci.st >= 0 ? String(data[r][ci.st] || '') : '',
      work_date: ws,
      due:    ci.du >= 0 ? String(data[r][ci.du] || '') : '',
      work_content: ci.wc >= 0 ? String(data[r][ci.wc] || '') : ''
    });
  }

  if (!rows.length) { Logger.log('対象案件が0件（案件No が ad- で始まる行がありません）'); return; }

  var done = 0;
  var B = 150;
  for (var i = 0; i < rows.length; i += B) {
    var chunk = rows.slice(i, i + B);
    var res = UrlFetchApp.fetch(URL, {
      method: 'post',
      contentType: 'application/json',
      headers: { apikey: ANON, Prefer: 'resolution=merge-duplicates,return=minimal' },
      payload: JSON.stringify(chunk),
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    if (code >= 300) {
      Logger.log('ERROR ' + code + ' : ' + res.getContentText().slice(0, 500));
      return;
    }
    done += chunk.length;
  }
  Logger.log('cl_cases 同期完了: kbn=' + kbn + ' / ' + done + '件');
}
