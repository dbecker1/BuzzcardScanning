/*
* A JavaScript implementation of BuzzCard scanning & attendance using Sheets.
*
* FILE:	    buzzcards.js
* VERSION:	1.0
* AUTHORS:	Daniel Becker & Cliff Panos
*
*/

var spreadsheetId = "";
var rosterId = "";
var signedIn = false;
var readingBarcode = false;
var scanRead = "";
var oauthToken;

var activeScanning = false;
var roster = [];

var API_KEY = "AIzaSyBAVdY6W4eW-Up1t53nAKlqDp1FHiJL_VM";
var CLIENT_ID = "523456694441-v0mpgb9n57o11u1r87jfugo826mh8iqp.apps.googleusercontent.com";
var SCOPE = "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive";

function initBuzzcards() {
    gapi.load("client:auth2", () => {
        gapi.load("picker", () => {
            gapi.client.init({
                "apiKey" : API_KEY,
                "clientId" : CLIENT_ID,
                "scope" : SCOPE,
                "discoveryDocs" : ['https://sheets.googleapis.com/$discovery/rest?version=v4'],
            }).then(() => {
                gapi.auth2.getAuthInstance().isSignedIn.listen(updateSignedIn);

                if (!gapi.auth2.getAuthInstance().isSignedIn.get()) {
                    gapi.auth2.getAuthInstance().signIn();
                }

                updateSignedIn(gapi.auth2.getAuthInstance().isSignedIn.get());

                document.addEventListener("keypress", handleKeyPress);
            });
        });
    });
}

function updateSignedIn(isSignedIn) {
    signedIn = true;

    if (isSignedIn) {
        var auth = gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse(true);
        oauthToken = auth.access_token;
        getCookies();


        if (rosterId !== "" && rosterId) {
            loadRoster();

            if (spreadsheetId !== "" && spreadsheetId) {
                loadSwipes();
                activateScanning();
            }
        }
    }
}

function pickRoster() {
    var picker = new google.picker.PickerBuilder().
    addView(google.picker.ViewId.SPREADSHEETS).
    setOAuthToken(oauthToken).
    setDeveloperKey(API_KEY).
    setCallback((data) => {
        if (data[google.picker.Response.ACTION] == google.picker.Action.PICKED) {
            var doc = data[google.picker.Response.DOCUMENTS][0];
            rosterId = doc[google.picker.Document.ID];
            var spreadsheetName = doc[google.picker.Document.NAME];
            var rosterButtonName = "Roster: " + spreadsheetName;
            document.getElementById("rosterButton").innerText = rosterButtonName;
            updateSubmitFormsButton();
        }
    }).build();
    picker.setVisible(true);
}

function pickAttendanceSheet() {
    var picker = new google.picker.PickerBuilder().
    addView(google.picker.ViewId.SPREADSHEETS).
    setOAuthToken(oauthToken).
    setDeveloperKey(API_KEY).
    setCallback((data) => {
        if (data[google.picker.Response.ACTION] == google.picker.Action.PICKED) {
            var doc = data[google.picker.Response.DOCUMENTS][0];
            spreadsheetId = doc[google.picker.Document.ID];
            var spreadsheetName = doc[google.picker.Document.NAME];
            var attendanceButtonName = "Attendance: " + spreadsheetName;
            document.getElementById("attendanceButton").innerText = attendanceButtonName;
            updateSubmitFormsButton();
        }
    }).build();
    picker.setVisible(true);
}

function updateSubmitFormsButton() {
    var ableToSubmit = rosterId && spreadsheetId;
    var submitFormsButton = document.getElementById("submitFormsButton");
    if (ableToSubmit) {
        submitFormsButton.className = "button primary scrolly";
    } else {
        submitFormsButton.className = "button primary disabled";
    }
}

function loadRoster() {
    var params = {
        spreadsheetId: rosterId,
        ranges: "A:B",
        includeGridData: true,
    };
    var request = gapi.client.sheets.spreadsheets.get(params);
    request.then(function(response) {
        // TODO: Change code below to process the `response` object:
        processRoster(response.result);
    }, function(reason) {
        console.error('error: ' + reason.result.error.message);
    });
}

function loadSwipes() {
    var params = {
        spreadsheetId: spreadsheetId,
        ranges: "SWIPES!A:A",
        includeGridData: true,
    };
    var request = gapi.client.sheets.spreadsheets.get(params);
    request.then(function(response) {
        // TODO: Change code below to process the `response` object:
        processSwipes(response.result);
    }, function(reason) {
        console.error('error: ' + reason.result.error.message);
    });
}

function processRoster(spreadsheet) {
    roster = [];
    var data = spreadsheet.sheets[0].data[0].rowData;
    data.forEach((row) => {
        if (row.values[0].formattedValue) {
            var member = {
                name: row.values[0].formattedValue,
                hashedGtid: row.values[1].formattedValue
            }
            roster.push(member);
        }
    });
    console.log(roster);
}

function processSwipes(spreadsheet) {
    var data = spreadsheet.sheets[0].data[0].rowData;
    data.forEach((row) => {
        if (row.values[0].formattedValue) {
            showSwipe(row.values[0].formattedValue);
        }
    });
    console.log(roster);
}

function appendToSheet(row) {
    gapi.client.sheets.spreadsheets.values.append({
        spreadsheetId: spreadsheetId,
        range: "SWIPES!A:B",
        valueInputOption: "RAW",
        resource: {
            values:[row]
        }
    }).then((response) => {
        var result = response.result;
        console.log(`Row appended ${row}`);
    });
}

function loadRoster() {
    var params = {
        spreadsheetId: rosterId,
        ranges: "A:B",
        includeGridData: true,
    };
    var request = gapi.client.sheets.spreadsheets.get(params);
    request.then(function(response) {
        // TODO: Change code below to process the `response` object:
        processRoster(response.result);
    }, function(reason) {
        console.error('error: ' + reason.result.error.message);
    });
}

function showSwipe(name) {
    if (name === "Name" || name === "") {
        return;
    }
    var output = document.getElementById("swipeOutput");
    var nameElement = document.createElement("h3");
    nameElement.style = "font-size:22pt;font-weight:normal";
    nameElement.innerHTML = name;

    output.insertBefore(nameElement, output.firstChild);
}

function handleSwipe(swipe) {
    if (!activeScanning) {
        return;
    }
    if (swipe == "stop") {
        deactivateScanning();
        return;
    }
    if(swipe == "admin") {
        activateAdmin();
        return;
    }
    var re = /[90]\d{8}/;
    var matches = swipe.match(re);
    if (!matches || matches.length === 0) {
        showSwipe("Not found/Invalid Entry");
        return;
    }
    var gtid = matches[0];
    var hash = sha256_digest(gtid);
    foundName = null;
    roster.forEach((member) => {
        if (member.hashedGtid === hash) {
            foundName = member.name
        }
    });
    if (foundName) {
        var checkinValues = [foundName, new Date().toString()];
        appendToSheet(checkinValues);
        showSwipe(foundName);
    } else {
        showSwipe("Not found/Invalid Swipe");
    }
}

function handleKeyPress(e) {
    if (e.keyCode === 59) { // semicolon
        // Start of scan
        readingBarcode = true;
        document.getElementById("scanning").innerHTML = "Scanning...";
        e.preventDefault();
        return;
    }
    if (readingBarcode) {
        e.preventDefault();
        if (e.keyCode === 13) { // Enter
            readingBarcode = false;
            handleSwipe(scanRead);
            scanRead = '';
            document.getElementById("scanning").innerHTML = "";
            return;
        }
        // Append the next key to the end of the list
        scanRead += e.key;
    }
}

function handleSubmit(event) {
    if (!(rosterId && spreadsheetId)) {
        return;
    }
    var buzzcardsSwipesSection = document.getElementById("scanningRunning");
    buzzcardsSwipesSection.style.display = "block";
    loadRoster();
    loadSwipes();
    saveCookies();
    activateScanning();

    var formSelectionSection = document.getElementById("scanningForm");
    formSelectionSection.style.display = "none";
}

function submitManualEntry() {
    var entry = document.getElementById("manualEntry").value;
    document.getElementById("manualEntry").value = "";
    console.log("entry");
    handleSwipe(entry);
}

function activateScanning() {
    activeScanning = true;
    document.getElementById("scanningForm").style.display = "none";
    document.getElementById("scanningRunning").style.display = "block";
}

function deactivateScanning() {
    activeScanning = false;
    document.getElementById("scanningForm").style.display = "block";
    document.getElementById("scanningRunning").style.display = "none";
    document.getElementById("rosterButton").innerText = "Select Roster";
    document.getElementById("attendanceButton").innerText = "Select Attendance";
    document.getElementById("swipeOutput").innerHTML = "<h3></h3>";
    rosterId = "";
    spreadsheetId = "";
    updateSubmitFormsButton();
    saveCookies();
}

function activateAdmin() {
    var admin = document.getElementById("admin");
    var select = document.getElementById("select")

    select.addEventListener("change", adminSelect);

    for (var i = 0; i < roster.length; i++) {
        var current = roster[i];
        var option = document.createElement("option");
        option.value = current.name;
        option.innerText = current.name;

        select.appendChild(option);
    }

    admin.style.display = "";
}

function adminSelect(event) {
    var name = event.target.value;
    var checkinValues = [name, new Date().toString()];
    appendToSheet(checkinValues);
    showSwipe(name);
}

function saveCookies() {
    document.cookie = "rosterId=" + rosterId;
    document.cookie = "spreadsheetId=" + spreadsheetId;
}
function getCookies() {
    rosterId = getCookie("rosterId");
    spreadsheetId = getCookie("spreadsheetId");
}
function getCookie(name) {
    var value = "; " + document.cookie;
    var parts = value.split("; " + name + "=");
    if (parts.length == 2) return parts.pop().split(";").shift();
}
