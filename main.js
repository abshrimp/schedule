let CLIENT_ID, CLIENT_SECRET, API_KEY, REFRESH_TOKEN, SHEET_ID, TASK_CAL_ID, CAL_ID, GAS_URL, nextclass, cl_data;


const dbName = 'DB';
const dbVersion = '1';
const storeName = 'passwords';
const openReq = indexedDB.open(dbName, dbVersion);
openReq.onupgradeneeded = function (event) {
    var db = event.target.result;
    const objectStore = db.createObjectStore(storeName, { keyPath: 'id' })
    objectStore.createIndex("id", "id", { unique: true });
    objectStore.createIndex("cl", "cl", { unique: false });
    objectStore.createIndex("cs", "cs", { unique: false });
    objectStore.createIndex("api", "api", { unique: false });
    objectStore.createIndex("token", "token", { unique: false });
    objectStore.createIndex("sh", "sh", { unique: false });
    objectStore.createIndex("c1", "c1", { unique: false });
    objectStore.createIndex("c2", "c2", { unique: false });
    objectStore.createIndex("url", "url", { unique: false });
    console.log('DB更新');
}

openReq.onsuccess = function (event) {
    var db = event.target.result;
    var trans_g = db.transaction(storeName, 'readonly');
    var store_g = trans_g.objectStore(storeName);
    var getReq_g = store_g.get(1);

    getReq_g.onsuccess = function (event) {
        if (typeof event.target.result === 'undefined') {
            let input = window.prompt("keyを入力してください", "");
            let keys = input.split("$");
            var trans = db.transaction(storeName, "readwrite");
            var store = trans.objectStore(storeName);
            var putReq = store.put({
                id: 1,
                cl: keys[0],
                cs: keys[1],
                api: keys[2],
                token: keys[3],
                sh: keys[4],
                c1: keys[5],
                c2: keys[6],
                url: keys[7],
            });
            CLIENT_ID = keys[0];
            CLIENT_SECRET = keys[1];
            API_KEY = keys[2];
            REFRESH_TOKEN = keys[3];
            SHEET_ID = keys[4];
            TASK_CAL_ID = keys[5];
            CAL_ID = keys[6];
            GAS_URL = keys[7];
        } else {
            let r = event.target.result;
            CLIENT_ID = r.cl;
            CLIENT_SECRET = r.cs;
            API_KEY = r.api;
            REFRESH_TOKEN = r.token;
            SHEET_ID = r.sh;
            TASK_CAL_ID = r.c1;
            CAL_ID = r.c2;
            GAS_URL = r.url;
        }
        getdata();
    }
}

function deleteDB() {
    indexedDB.deleteDatabase(dbName);
    alert("削除しました");
}

let _token = {
    data: ["", new Date()],
    get: async function (func) {
        if (this.data[0] === "" || new Date().getTime() - this.data[1].getTime() > 59 * 60 * 1000) await get_access_token();
        func(this.data[0]);
    }
}

function encode(data) {
    let params = [];
    for (let name in data) params.push(encodeURIComponent(name) + '=' + encodeURIComponent(data[name]));
    return params.join('&').replace(/%20/g, '+');
}

function get_access_token() {
    return new Promise((r) => {
        let data = { client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: REFRESH_TOKEN, grant_type: "refresh_token" };
        let xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function () {
            if (this.readyState == 4 && this.status == 200) {
                _token.data = [JSON.parse(this.responseText).access_token, new Date()];
                r();
            }
        }
        xhr.open('POST', 'https://www.googleapis.com/oauth2/v4/token');
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.send(encode(data));
    });
}

function adddata(range, str, todo = false) {
    _token.get((token) => {
        let data = { "values": [[str]] }
        let xhr = new XMLHttpRequest();
        xhr.open('PUT', 'https://content-sheets.googleapis.com/v4/spreadsheets/' + SHEET_ID + '/values/' + range + '?valueInputOption=USER_ENTERED&alt=json&key=' + API_KEY);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Authorization', 'Bearer ' + token);
        xhr.onreadystatechange = function () {
            if (this.readyState == 4 && this.status == 200) {
                if (todo) edit_todo();
            }
        }
        xhr.send(JSON.stringify(data));
    });
}

function getdata() {
    _token.get((token) => {
        let flag = 0;

        let xhr = new XMLHttpRequest();
        xhr.open('GET', GAS_URL + "?p=cl");
        xhr.onload = () => {
            cl_data = JSON.parse(xhr.response);
            flag++;
        };
        xhr.send();

        let xhr2 = new XMLHttpRequest();
        xhr2.open('GET', 'https://content-sheets.googleapis.com/v4/spreadsheets/' + SHEET_ID + '/values/ToDo!A2%3AH?key=' + API_KEY);
        xhr2.setRequestHeader('Authorization', 'Bearer ' + token);
        xhr2.onload = () => {
            flag++;
        };
        xhr2.send();

        let xhr3 = new XMLHttpRequest();
        xhr3.open('GET', 'https://content-sheets.googleapis.com/v4/spreadsheets/' + SHEET_ID + '/values/event2!A2%3AC?key=' + API_KEY);
        xhr3.setRequestHeader('Authorization', 'Bearer ' + token);
        xhr3.onload = () => {
            let timerId = setInterval(() => {
                if (flag == 2) {
                    clearInterval(timerId);
                    make_todo(JSON.parse(xhr2.response).values, JSON.parse(xhr3.response).values);
                }
            }, 10);
        };
        xhr3.send();
    });
}


//アプリ内の現在時刻（-4時間）
function today() {
    let date = new Date();
    date.setHours(date.getHours() - 4);
    return date;
}


let calendar;

window.onload = function () {
    window.addEventListener('error', function (e) {
        document.getElementById("other_content").value = e.message;
    })

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register("/schedule/service-worker.js")
            .then(function (registration) {
                console.log("serviceWorker registed.");
            }).catch(function (error) {
                console.warn("serviceWorker error.", error);
            });
    }

    let calendarEl = document.getElementById('calendar'), drag = false, posi, eventcount = 0;

    calendar = new FullCalendar.Calendar(calendarEl, {
        timeZone: 'local',
        locale: 'ja',
        initialView: 'timeGridDay',
        views: {
            dayGridMonth: {
                titleFormat: {
                    year: 'numeric',
                    month: 'short'
                },
                dateClick: function (info) {
                    change_cl('4day', false)
                    calendar.changeView('timeGridDay', info.dateStr);
                },
                eventTimeFormat: function () { return '' },
                eventMouseEnter: function (info) {
                    change_cl('4day', false)
                    calendar.changeView('timeGridDay', info.event.start);
                }
            },
            timeGridDay: {
                type: 'timeGrid',
                duration: { days: 4 },
                titleFormat: {
                    month: 'short',
                    day: 'numeric'
                },
                slotLabelInterval: '01:00',
                slotLabelFormat: {
                    hour: 'numeric',
                    minute: '2-digit'
                }
            }
        },
        headerToolbar: {
            left: '',
            center: 'title',
            right: ''
        },
        height: '100%',
        slotDuration: '00:15',
        snapDuration: '00:05',
        expandRows: true,
        nowIndicator: true,
        eventShortHeight: 1,
        scrollTimeReset: false,
        scrollTime: (new Date().getHours() - 2) + ':00:00',
        dayCellContent: function (e) {
            e.dayNumberText = e.dayNumberText.replace('日', '');
        },
        longPressDelay: 300,
        eventLongPressDelay: 300,
        selectLongPressDelay: 300,
        eventResizeStart: function () {
            drag = true;
        },
        eventResize: function (info) {

        },
        eventChange: function (info) {
            eventcount++;
            _token.get((token) => {
                let xhr4 = new XMLHttpRequest();
                xhr4.open('GET', 'https://content-sheets.googleapis.com/v4/spreadsheets/' + SHEET_ID + '/values/event2!A2%3AC?key=' + API_KEY);
                xhr4.setRequestHeader('Authorization', 'Bearer ' + token);
                xhr4.onload = () => {
                    let events = JSON.parse(xhr4.response).values,
                        title = info.event.title,
                        start = info.oldEvent.start.toString(),
                        end = info.oldEvent.end.toString();
                    for (let i = 0; i < events.length; i++) {
                        if (events[i][0] == title && new Date(events[i][1]) == start, new Date(events[i][2]) == end) {
                            let data = { "values": [[info.event.start.toLocaleString('ja-JP'), info.event.end.toLocaleString('ja-JP')]] }
                            let xhr = new XMLHttpRequest();
                            xhr.open('PUT', 'https://content-sheets.googleapis.com/v4/spreadsheets/' + SHEET_ID + '/values/event2!B' + (i + 2) + ':C' + (i + 2) + '?valueInputOption=USER_ENTERED&alt=json&key=' + API_KEY);
                            xhr.setRequestHeader('Content-Type', 'application/json');
                            xhr.setRequestHeader('Authorization', 'Bearer ' + token);
                            xhr.onreadystatechange = function () {
                                if (this.readyState == 4 && this.status == 200) {
                                    eventcount--;
                                    if (eventcount == 0) edit_todo();
                                }
                            }
                            xhr.send(JSON.stringify(data));
                            break;
                        }
                    }
                };
                xhr4.send();
            });
        },
        businessHours: {
            daysOfWeek: [1, 2, 3, 4, 5],
            startTime: '00:00',
            endTime: '24:00',
        },
    });

    calendar.render();

    let element = document.getElementsByClassName("fc-view-harness fc-view-harness-active")[0];
    element.addEventListener("touchstart", start_check);
    element.addEventListener("touchend", end_check);

    function start_check(event) {
        posi = {};
        posi.x = event.changedTouches[0].pageX;
        posi.y = event.changedTouches[0].pageY;
    }

    function end_check(event) {
        let dx = posi.x - event.changedTouches[0].pageX;
        let dy = posi.y - event.changedTouches[0].pageY;
        if (Math.abs(dx) > Math.abs(dy) && !drag) {
            if (dx > 30) calendar.next();
            else if (dx < -30) calendar.prev();
        }
        drag = false;
    }

    let radio_btns = document.querySelectorAll(`input[type='radio'][name='type']`);

    for (let target of radio_btns) {
        target.addEventListener(`change`, function () {
            document.querySelector(`#output`).innerHTML = `${target.value} : ${target.checked}`;
        });
    }

    reset_form()
}

//課題入力フォームのリセット
let ishomework = false;
function reset_form() {
    let date = today();
    let y = date.getFullYear();
    let m = (date.getMonth() + 1).toString().padStart(2, "0");
    let d = date.getDate().toString().padStart(2, "0");
    document.getElementById("date_start").value = y + "-" + m + "-" + d;

    date.setDate(date.getDate() + 7);
    y = date.getFullYear();
    m = (date.getMonth() + 1).toString().padStart(2, "0");
    d = date.getDate().toString().padStart(2, "0");
    document.getElementById("date_end").value = y + "-" + m + "-" + d;

    document.getElementById("amount").value = 1;

    change_date2();
}


//ToDo 日常
function make_todo(data, data2) {
    if (data === undefined) data = [];

    for (var i = 0; i < data2.length; i++) {
        calendar.addEvent({
            title: data2[i][0],
            start: new Date(data2[i][1]),
            end: new Date(data2[i][2]),
            color: "#696969",
            editable: true,
            display: "list-item"
        });
    }

    for (var i = 0; i < cl_data.length; i++) {
        if (cl_data[i][1]) {
            calendar.addEvent({
                title: cl_data[i][0],
                start: new Date(cl_data[i][2]).toLocaleDateString("ja-JP", {year: "numeric",month: "2-digit",day: "2-digit"}).replaceAll("/", "-"),
                display: "block",
                color: "#edc14b"
            });
        } else {
            calendar.addEvent({
                title: cl_data[i][0],
                start: new Date(cl_data[i][2]),
                end: new Date(cl_data[i][3]),
                color: "#edc14b",
                editable: false,
                display: 'block'
            });
        }
    }
    
    for (var i = 0; i < holiday.length; i++) {
        calendar.addEvent(holiday[i]);
    }

    let ratio = document.getElementsByName("subject");
    let subjects = [];
    for (let i = 0; i < ratio.length; i++) {
        subjects.push([ratio[i].nextElementSibling.innerText, ratio[i].dataset.col])
    }


    for (var i = 0; i < data.length; i++) {
        data[i].push(i);
        let start = new Date(data[i][6]);
        start.setHours(start.getHours() - 6);
        data[i].push(start.toLocaleDateString());
    }
    data.sort((a, b) => {
        if (a[9] !== b[9]) {
            return new Date(a[6]) - new Date(b[6]);
        } else {
            return ((a[2] !== a[4]) === (b[2] !== b[4])) ? 0 : (a[2] !== a[4]) ? -1 : 1;
        }
    });

    let day = "";
    let tbody = document.getElementById("todo");
    for (var i = 0; i < data.length; i++) {
        //if (data[i][0] === "") continue;

        let color = isNaN(data[i][0][data[i][0].length - 1]) ? "#20b2aa" : "#e25d33";
        /*for (let j = 0; j < subjects.length; j++) {
            if (data[i][0].includes(subjects[j][0])) {
                color = subjects[j][1];
                break;
            }
            if (j == subjects.length - 1) color = subjects[subjects.length - 1][1]
        }*/

        if (data[i][1] != 0) {
            calendar.addEvent({
                title: data[i][0],
                start: new Date(data[i][6]),
                end: new Date(data[i][7]),
                color: color,
                editable: false,
                display: 'block'
            });
        }

        let day2 = new Date(data[i][9]).toLocaleDateString("ja-JP", {year: "numeric",month: "2-digit", day: "2-digit"});
        if (day !== day2) {
            day = day2
            let tr = document.createElement('tr');
            let th = document.createElement('th');
            th.setAttribute("colspan", "4");
            th.innerText = day;
            tr.appendChild(th);
            tbody.appendChild(tr);
        }

        let tr = document.createElement('tr');
        tr.setAttribute("data-i", data[i][8]);

        let td = document.createElement('td');
        td.innerText = "●";
        td.style.color = color;
        tr.appendChild(td);

        td = document.createElement('td');
        td.innerText = data[i][0];
        tr.appendChild(td);

        td = document.createElement('td');
        td.innerText = data[i][4];
        tr.appendChild(td);

        td = document.createElement('td');
        if (data[i][2] == "") td.innerText = data[i][3] + "/" + data[i][1] + "m";
        else td.innerText = data[i][3] + "/" + data[i][2];
        if (data[i][3] !== "0") td.style = "color: red";
        tr.appendChild(td);

        let end = (data[i][2] == "") ? 1 : 2;
        if (data[i][end] == data[i][3]) done(tr);

        tbody.appendChild(tr);
    }

    let elements = document.querySelectorAll("#todo>tr:has(td):not([class])"), posi2;
    for (var i = 0; i < elements.length; i++) {
        elements[i].addEventListener("touchstart", start_todo);
        elements[i].addEventListener("touchmove", move_todo);
        elements[i].addEventListener("touchend", end_todo);
    }
    elements = document.querySelectorAll("#todo>.already");
    for (var i = 0; i < elements.length; i++) {
        elements[i].addEventListener("touchstart", start_todo);
        elements[i].addEventListener("touchend", end_todo2);
    }

    function start_todo(event) {
        posi2 = {};
        posi2.x = event.changedTouches[0].pageX;
        posi2.y = event.changedTouches[0].pageY;
    }

    function move_todo(event) {
        let move = event.changedTouches[0].pageX - posi2.x;
        if (move <= -15) {
            document.getElementById("todo-container").style = "overflow-y: hidden;"
            this.style = "translate: " + move + "px";
        }
    }

    function end_todo(event) {
        event.preventDefault();
        document.getElementById("todo-container").style = "";
        let move = event.changedTouches[0].pageX - posi2.x;
        let movey = event.changedTouches[0].pageY - posi2.y;
        if (move > -15 && Math.abs(movey) < 2) {
            this.children[3].style = "color: red"
            let data_i;
            data.forEach(e => {
                if (e[8] === Number(this.dataset.i)) data_i = e;
            });
            let time = (data_i[2] == "") ? 5 : 1;
            let time2 = Number(this.children[3].innerText.split("/")[0]);
            let end = (data_i[2] == "") ? 1 : 2;
            if (time2 + time >= data_i[end]) {
                this.style = "translate: 0px";
                setTimeout(() => done(this), 1);
            }
            else {
                time3 = time2 + time;
                adddata("ToDo!D" + (Number(this.dataset.i) + 2), time3);
                this.children[3].innerText = time3 + "/" + data_i[end];
                if (end == 1) this.children[3].innerText += "m";
            }
        }
        else if (move > -50) this.style = "translate: 0px; transition: 0.3s;";
        else done(this);
    }

    function done(tr) {
        tr.style = "translate: -100%; transition: 0.3s;";

        let data_i;
        data.forEach(e => {
            if (e[8] === Number(tr.dataset.i)) data_i = e;
        });
        let end = (data_i[2] == "") ? 1 : 2;
        adddata("ToDo!D" + (Number(tr.dataset.i) + 2), data_i[end]);

        setTimeout(() => {
            let new_element = tr.cloneNode(true);
            new_element.style = "";
            new_element.setAttribute("class", "already");
            new_element.children[0].innerText = "";
            new_element.children[3].style = ""
            new_element.children[3].innerText = data_i[end] + "/" + data_i[end];
            if (end == 1) new_element.children[3].innerText += "m";
            new_element.addEventListener("touchstart", start_todo);
            new_element.addEventListener("touchend", end_todo2);

            let ele = tr;
            while (true) {
                let next = ele.nextSibling;
                if (next === null) break;
                if (next.children[0].tagName === "TH") break;
                if (next.className === "already" && Number(next.dataset.i) > Number(tr.dataset.i)) break;
                ele = next;
            }

            ele.after(new_element);
            tr.remove();
        }, 300);
    }

    function end_todo2(event) {
        event.preventDefault();
        let move = event.changedTouches[0].pageX - posi2.x;
        let movey = event.changedTouches[0].pageY - posi2.y;
        if (Math.abs(move) > 2 || Math.abs(movey) > 2) return;

        let data_i;
        data.forEach(e => {
            if (e[8] === Number(this.dataset.i)) data_i = e;
        });
        adddata("ToDo!D" + (Number(this.dataset.i) + 2), 0);

        let new_element = this.cloneNode(true);
        new_element.classList.remove("already");
        new_element.children[0].innerText = "●";
        let end = (data_i[2] == "") ? 1 : 2;
        new_element.children[3].innerText = "0/" + data_i[end];
        if (end == 1) new_element.children[3].innerText += "m";
        new_element.addEventListener("touchstart", start_todo);
        new_element.addEventListener("touchmove", move_todo);
        new_element.addEventListener("touchend", end_todo);

        let ele = this.previousSibling;
        while (true) {
            if (ele.children[0].tagName === "TH") break;
            if (ele.className !== "already" && Number(ele.dataset.i) < Number(this.dataset.i)) break;
            ele = ele.previousSibling;
        }

        ele.after(new_element);
        this.remove();
    }

}





//event追加
function addevent(event, id) {
    _token.get((token) => {
        let data = {
            "summary": event.title,
            "start": {
                "date": event.date1,
                "timeZone": "Asia/Tokyo"
            },
            "end": {
                "date": event.date2,
                "timeZone": "Asia/Tokyo"
            },
            "description": event.desc
        }
        let xhr = new XMLHttpRequest();
        xhr.open('POST', 'https://www.googleapis.com/calendar/v3/calendars/' + id + '/events?key=' + API_KEY);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Authorization', 'Bearer ' + token);
        xhr.onreadystatechange = function () {
            if (this.readyState == 4 && this.status == 200) edit_todo();
        }
        xhr.send(JSON.stringify(data));
        alert("送信しました");
        reset_form();
    });
}

//event更新？
function updateevent(date, id) {
    _token.get((token) => {
        let data = {
            "start": {
                "date": date.date1,
                "timeZone": "Asia/Tokyo"
            },
            "end": {
                "date": date.date2,
                "timeZone": "Asia/Tokyo"
            }
        }
        let xhr = new XMLHttpRequest();
        xhr.open('PATCH', 'https://www.googleapis.com/calendar/v3/calendars/' + TASK_CAL_ID + '/events/' + id + '?key=' + API_KEY);
        xhr.setRequestHeader('Content-Type', 'application/json');
        xhr.setRequestHeader('Authorization', 'Bearer ' + token);
        xhr.onreadystatechange = function () {
            if (this.readyState == 4 && this.status == 200) edit_todo();
        }
        xhr.send(JSON.stringify(data));
    });
}





//課題送信ボタンが押されたとき
function submit() {
    if (get_val('content')[0] === "削除") { //隠しコマンド
        deleteDB();
        return;
    }

    let event = {};
    /*let subject = get_val('subject');
    if (subject[0] == "総英" || subject[0] == "異理") { //区別無し教科設定
        if (nextclass[4][0] < nextclass[5][0]) subject = ["総英", 4];
        else subject = ["異理", 5];
    }*/
    event.title = /*(get_val('subject')[0] == "無指定") ? get_val('content')[0] : subject[0] + " " +*/ get_val('content')[0];

    set_date(event, "date_end");

    let time_str = isInt(get_val('time')[0].replace(/[^0-9.]/g, ''), "時間");
    let number_str = isInt(document.getElementById("amount").value.replace(/[^0-9.]/g, ''), "回数");
    if (!time_str || !number_str) return;

    //開始日、一回分の時間、全回数、やった時間 or 回数、次の授業までかどうか　　　全回数が1以外のとき、通し番号を表示する
    event.desc = new Date(document.getElementById("date_start").value).toLocaleDateString() + ", " + time_str + ", " + number_str + ", 0, " + ishomework;
    addevent(event, TASK_CAL_ID);

}

//eventオブジェクトに指定idのinputの日付をセット
function set_date(event, name) {
    event.date1 = document.getElementById(name).value; //必ず最初にセットされる
    let date = new Date(event.date1);
    date.setDate(date.getDate() + 1);
    event.date2 = get_datestr(date);
}

//整数判定　"数字" or false を返す
function isInt(str, err) {
    let st_num = Number(str);
    if (str === "" || !Number.isInteger(st_num)) {
        alert(err + "は整数で入力してください");
        return false;
    } else return str;
}

//Dateをstrに変換
function get_datestr(date) {
    let y = date.getFullYear();
    let m = (date.getMonth() + 1).toString().padStart(2, "0");
    let d = date.getDate().toString().padStart(2, "0");
    return y + "-" + m + "-" + d;
}

//ラジオボタンの内容取得
function get_val(name) {
    let buttons = document.getElementsByName(name);
    for (let i = 0; i < buttons.length; i++) {
        if (buttons.item(i).checked) {
            let val = buttons.item(i).nextElementSibling.innerText;
            if (val === "その他") val = document.getElementById('other_' + name).value;
            return [val, i];
        }
    }
}





function change_date(num) {
    let date = today();
    date.setDate(date.getDate() + Number(nextclass[num][0]));
    y = date.getFullYear();
    m = (date.getMonth() + 1).toString().padStart(2, "0");
    d = date.getDate().toString().padStart(2, "0");
    let input = document.getElementById("date_end");
    input.value = y + "-" + m + "-" + d;
    input.style.backgroundColor = '#ffff00';
    ishomework = true;
}

function change_date2() {
    let input = document.getElementById("date_end");
    input.style.backgroundColor = '';
    ishomework = false;
}

function change_page(id) {
    document.getElementById("todo-container").style = "display: none;";
    document.getElementById("form").style = "display: none;";
    document.getElementById("calendar-div").style = "display: none;";
    document.getElementById(id).style = "";
    if (id === "calendar-div") calendar.render();
}

function change_cl(id, flag = true) {
    if (flag) {
        if (id === "month") calendar.changeView('dayGridMonth');
        else calendar.changeView('timeGridDay');
    }
    document.getElementById("month").style = "";
    document.getElementById("4day").style = "";
    document.getElementById(id).style = "background-color: #000; color: #fff";
}


let nowloading = 0;

function edit_todo() {
    let flag = 0;
    nowloading++;
    let xhr = new XMLHttpRequest();
    xhr.open('GET', GAS_URL);
    xhr.onload = () => {
        calendar.removeAllEvents();
        document.getElementById("todo").innerHTML = "";

        _token.get((token) => {
            let xhr2 = new XMLHttpRequest(), flag = false;
            xhr2.open('GET', 'https://content-sheets.googleapis.com/v4/spreadsheets/' + SHEET_ID + '/values/ToDo!A2%3AH?key=' + API_KEY);
            xhr2.setRequestHeader('Authorization', 'Bearer ' + token);
            xhr2.onload = () => {
                flag++;
            };
            xhr2.send();

            let xhr3 = new XMLHttpRequest();
            xhr3.open('GET', 'https://content-sheets.googleapis.com/v4/spreadsheets/' + SHEET_ID + '/values/event2!A2%3AC?key=' + API_KEY);
            xhr3.setRequestHeader('Authorization', 'Bearer ' + token);
            xhr3.onload = () => {
                let timerId = setInterval(() => {
                    if (flag === 1) {
                        clearInterval(timerId);
                        nowloading--;
                        if (nowloading === 0) {
                            make_todo(JSON.parse(xhr2.response).values, JSON.parse(xhr3.response).values);
                            for (var i = 0; i < holiday.length; i++) {
                                calendar.addEvent(holiday[i]);
                            }
                        }
                    }
                }, 10);
            };
            xhr3.send();
        });
    };
    xhr.send();

}
