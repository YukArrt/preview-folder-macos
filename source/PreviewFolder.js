/* PreviewFolder 1.3 — JavaScript for Automation, compiled on the user's Mac.
 * No shell interpolation, image decoding, recursive search, or image writes.
 * Preview itself remains responsible for displaying and editing the images.
 */
ObjC.import('Foundation');
ObjC.import('AppKit');

var PF_TITLE = 'Просмотр папки';
var PF_PREVIEW_ID = 'com.apple.Preview';
var PF_WARN_COUNT = 120;
var PF_WARN_BYTES = 512 * 1024 * 1024;
var PF_LOG_LINES = [];

function logStage(message) {
    var line = new Date().toISOString() + ' ' + message;
    try { console.log(line); } catch (ignore) {}
    try {
        PF_LOG_LINES.push(line);
        var folder = $.NSHomeDirectory().stringByAppendingPathComponent('Library/Logs/PreviewFolder');
        $.NSFileManager.defaultManager.createDirectoryAtPathWithIntermediateDirectoriesAttributesError(
            folder, true, $.NSDictionary.dictionary, Ref());
        $(PF_LOG_LINES.join('\n') + '\n').writeToFileAtomicallyEncodingError(
            folder.stringByAppendingPathComponent('last-run.log'), true, $.NSUTF8StringEncoding, Ref());
    } catch (ignore) { /* Diagnostics must not prevent opening images. */ }
}

function beginRun(mode) {
    PF_LOG_LINES = [];
    logStage('PreviewFolder 1.3: ' + mode);
}

function bringToFront() {
    // The original background applet could leave Standard Additions dialogs
    // behind Finder. Make the chooser and error dialogs visible explicitly.
    try {
        $.NSApplication.sharedApplication.setActivationPolicy($.NSApplicationActivationPolicyRegular);
        $.NSApplication.sharedApplication.activateIgnoringOtherApps(true);
    } catch (error) { logStage('Activation: ' + String(error.message || error)); }
}

function ui() {
    var app = Application.currentApplication();
    app.includeStandardAdditions = true;
    return app;
}

function isCancelled(error) {
    return Number(error.errorNumber) === -128 || Number(error.number) === -128;
}

function showError(error) {
    var message = String(error.message || error);
    logStage('ERROR: ' + message);
    bringToFront();
    try {
        ui().displayAlert(PF_TITLE, {
            message: message + '\n\nДля проверки можно запустить Test_PreviewFolder.command из нового архива.',
            as: 'critical', buttons: ['OK'], defaultButton: 'OK'
        });
    } catch (dialogError) {
        logStage('Error dialog failed: ' + String(dialogError.message || dialogError));
        // osascript must return a nonzero status instead of hiding this failure.
        throw error;
    }
}

function extensionOf(name) {
    var index = name.lastIndexOf('.');
    return index < 0 ? '' : name.slice(index + 1).toLowerCase();
}

function deniedExtension(name) {
    // NSImage can also report document/vector types. Do not open those as images.
    return /^(pdf|ps|eps|epsf|epsi|eps2|eps3|ai|svg|svgz)$/i.test(extensionOf(name));
}

function supportedExtensions() {
    var result = Object.create(null);
    var basic = ['jpg', 'jpeg', 'jpe', 'png', 'tif', 'tiff', 'gif', 'bmp',
                 'dib', 'jp2', 'j2k', 'ico', 'icns', 'pict', 'pct'];
    for (var i = 0; i < basic.length; i++) result[basic[i]] = true;
    // This API is deprecated but remains useful on older macOS versions too.
    // Query the OS: HEIC, WebP, AVIF, PSD and RAW support varies by macOS.
    try {
        var types = ObjC.deepUnwrap($.NSImage.imageFileTypes);
        for (var j = 0; j < types.length; j++) {
            var ext = String(types[j]).toLowerCase();
            if (/^[a-z0-9]+$/.test(ext) && !deniedExtension('x.' + ext)) result[ext] = true;
        }
    } catch (ignore) {
        // Basic raster formats still work if the optional query is unavailable.
    }
    return result;
}

function defaultSort(reason) {
    return {key: 'name', descending: false, source: 'fallback', reason: reason || ''};
}

function finderEnum(value) {
    return String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function sortFromFinderColumn(column, direction) {
    var keys = {
        namecolumn: 'name', elsn: 'name',
        modificationdatecolumn: 'modifiedAt', elsm: 'modifiedAt',
        creationdatecolumn: 'createdAt', elsc: 'createdAt',
        sizecolumn: 'size', elss: 'size'
    };
    var key = keys[finderEnum(column)];
    var dir = finderEnum(direction);
    if (!key) return defaultSort('Unsupported Finder column: ' + String(column));
    if (dir !== 'normal' && dir !== 'snrm' && dir !== 'reversed' && dir !== 'srvs') {
        return defaultSort('Unknown Finder direction: ' + String(direction));
    }
    return {key: key, descending: dir === 'reversed' || dir === 'srvs', source: 'finder-list', reason: ''};
}

function canonicalFolder(path) {
    var normalized = ObjC.unwrap($(path).stringByStandardizingPath.stringByResolvingSymlinksInPath);
    return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized;
}

function folderFromFinderURL(value) {
    var url = $.NSURL.URLWithString($(String(value)));
    if (!url || url.isNil() || !url.isFileURL) return '';
    return canonicalFolder(ObjC.unwrap(url.path));
}

function finderSortFromWindows(windows, folder, deadline) {
    for (var i = 0; i < windows.length && i < 24 && Date.now() < deadline; i++) {
        var win = windows[i];
        var windowFolder = '';
        try {
            windowFolder = folderFromFinderURL(win.target.url({timeout: 3}));
        } catch (error) {
            var code = Number(error.errorNumber || error.number);
            if (code === -1743 || code === -1712) throw error;
            continue; // E.g. a Finder information window has no folder target.
        }
        if (windowFolder !== folder) continue;
        var view = finderEnum(win.currentView({timeout: 3}));
        if (view !== 'listview' && view !== 'lsvw') {
            return defaultSort('Matching Finder window is not in List view. Use Command-2.');
        }
        // Read the selected column directly. Enumerating all Finder columns is
        // both unnecessary and unreliable on some macOS releases.
        var col = win.listViewOptions.sortColumn;
        var rawColumn = col.name({timeout: 3});
        var rawDirection = col.sortDirection({timeout: 3});
        logStage('Finder column=' + String(rawColumn) + ', direction=' + String(rawDirection));
        return sortFromFinderColumn(rawColumn, rawDirection);
    }
    return defaultSort('No matching visible Finder folder window.');
}

function finderSort(folder) {
    try {
        var finder = Application('com.apple.finder');
        if (!finder.running()) return defaultSort('Finder is not running.');
        var wanted = canonicalFolder(folder);
        var windows = finder.windows({timeout: 5});
        // The foremost matching window wins. An unrelated front window must
        // never supply the sorting criterion for this folder.
        return finderSortFromWindows(windows, wanted, Date.now() + 4000);
    } catch (error) {
        return defaultSort('Cannot read Finder sorting: ' + String(error.message || error));
    }
}

function compareEntries(a, b, sort, compareNames) {
    if (sort.key === 'name') {
        var byName = compareNames(a.name, b.name);
        return sort.descending ? -byName : byName;
    }
    var av = a[sort.key], bv = b[sort.key];
    var aMissing = av === null || av === undefined || !isFinite(Number(av));
    var bMissing = bv === null || bv === undefined || !isFinite(Number(bv));
    if (aMissing !== bMissing) return aMissing ? 1 : -1;
    var result = aMissing ? 0 : Number(av) < Number(bv) ? -1 : Number(av) > Number(bv) ? 1 : 0;
    if (result) return sort.descending ? -result : result;
    return compareNames(a.name, b.name); // Stable natural-name tie breaker.
}

function buildPlan(entries, selected, supported, compareNames, sort) {
    sort = sort || defaultSort();
    var seen = Object.create(null);
    var images = [];
    var total = 0;
    for (var i = 0; i < entries.length; i++) {
        var item = entries[i];
        if (!item.regular || (item.name.charAt(0) === '.' && item.path !== selected) || deniedExtension(item.name)) continue;
        // The user can explicitly open a supported image without an extension.
        if (!supported[extensionOf(item.name)] && item.path !== selected) continue;
        if (seen[item.path]) continue;
        seen[item.path] = true;
        images.push(item);
        total += Number(item.size) || 0;
    }
    images.sort(function (a, b) { return compareEntries(a, b, sort, compareNames); });
    var paths = images.map(function (item) { return item.path; });
    return {
        paths: paths, selected: paths.indexOf(selected) >= 0 ? selected : null,
        totalBytes: total, sort: sort,
        needsChoice: paths.length > 1 && (paths.length > PF_WARN_COUNT || total >= PF_WARN_BYTES)
    };
}

function attributes(path) {
    var error = Ref();
    var attrs = $.NSFileManager.defaultManager.attributesOfItemAtPathError($(path), error);
    if (!attrs || attrs.isNil()) throw new Error('Не удалось прочитать файл:\n' + path);
    return {
        regular: ObjC.unwrap(attrs.objectForKey($.NSFileType)) === ObjC.unwrap($.NSFileTypeRegular),
        directory: ObjC.unwrap(attrs.objectForKey($.NSFileType)) === ObjC.unwrap($.NSFileTypeDirectory),
        size: Number(ObjC.unwrap(attrs.objectForKey($.NSFileSize))) || 0,
        modifiedAt: dateMilliseconds(attrs.objectForKey($.NSFileModificationDate)),
        createdAt: dateMilliseconds(attrs.objectForKey($.NSFileCreationDate))
    };
}

function dateMilliseconds(value) {
    if (!value || value.isNil()) return null;
    var milliseconds = Number(value.timeIntervalSince1970) * 1000;
    return isFinite(milliseconds) ? milliseconds : null;
}

function readFolder(folder) {
    logStage('Reading current folder');
    var manager = $.NSFileManager.defaultManager;
    var error = Ref();
    // JXA converts JavaScript null to NSNull, not Objective-C nil. A real
    // empty NSArray is required here; NSNull crashes enumeration on macOS 26.
    var urls = manager.contentsOfDirectoryAtURLIncludingPropertiesForKeysOptionsError(
        $.NSURL.fileURLWithPath($(folder)), $.NSArray.array,
        $.NSDirectoryEnumerationSkipsHiddenFiles, error
    );
    if (!urls || urls.isNil()) {
        throw new Error('Не удалось прочитать папку:\n' + folder +
            '\n\nРазреши приложению «Просмотр папки» доступ к этой папке, если macOS запрашивает его. ' +
            'Права можно проверить в «Системные настройки → Конфиденциальность и безопасность → Файлы и папки».');
    }
    var entries = [];
    for (var i = 0; i < Number(urls.count); i++) {
        var url = urls.objectAtIndex(i);
        var path = ObjC.unwrap(url.path);
        try {
            var info = attributes(path);
            entries.push({path: path, name: ObjC.unwrap(url.lastPathComponent),
                          regular: info.regular, size: info.size,
                          modifiedAt: info.modifiedAt, createdAt: info.createdAt});
        } catch (ignore) {
            // An inaccessible or disappearing sibling must not stop the other files.
        }
    }
    return entries;
}

function compareNames(a, b) {
    return Number($(a).localizedStandardCompare($(b)));
}

function openInPreview(paths) {
    if (!paths.length) return;
    logStage('Sending ' + paths.length + ' image(s) to Preview');
    var urls = $.NSMutableArray.array;
    for (var i = 0; i < paths.length; i++) urls.addObject($.NSURL.fileURLWithPath($(paths[i])));
    // Explicit bundle ID avoids recursion after PreviewFolder becomes the default.
    // A single event lets Preview group the files in one window. There is no shell
    // command or process-argument length limit, even with unusual file names.
    // $() creates a bridged nil for the optional object. Ref() is an out-pointer.
    var identifiers = Ref();
    var success = $.NSWorkspace.sharedWorkspace
        .openURLsWithAppBundleIdentifierOptionsAdditionalEventParamDescriptorLaunchIdentifiers(
            urls, $(PF_PREVIEW_ID), $.NSWorkspaceLaunchDefault, $(), identifiers
        );
    if (!success) throw new Error('macOS не смогла передать изображения приложению «Просмотр».');
}

function chooseSize(plan) {
    logStage('Showing large-folder choice');
    bringToFront();
    var mib = Math.round(plan.totalBytes / (1024 * 1024));
    var answer = ui().displayDialog(
        'В папке ' + plan.paths.length + ' изображений, размер файлов — около ' + mib +
        ' МБ.\n\nЧто открыть в «Просмотре»? При открытии всей папки большие изображения могут загружаться долго.',
        {withTitle: PF_TITLE, buttons: ['Отмена', 'Только выбранное', 'Открыть папку'],
         defaultButton: 'Только выбранное', cancelButton: 'Отмена'}
    );
    return answer.buttonReturned === 'Только выбранное' ? [plan.selected] : plan.paths;
}

function processFolder(folder, selected, supported) {
    var plan;
    try {
        var entries = readFolder(folder);
        // Count the selected file even if Finder normally hides it. Deduplication
        // in buildPlan prevents an ordinary selected file from being counted twice.
        var selectedInfo = attributes(selected);
        entries.push({path: selected, name: ObjC.unwrap($(selected).lastPathComponent),
                      regular: selectedInfo.regular, size: selectedInfo.size,
                      modifiedAt: selectedInfo.modifiedAt, createdAt: selectedInfo.createdAt});
        var sort = finderSort(folder);
        logStage('Sorting: ' + sort.key + (sort.descending ? ' descending' : ' ascending') +
                 ', source=' + sort.source + (sort.reason ? ', ' + sort.reason : ''));
        plan = buildPlan(entries, selected, supported, compareNames, sort);
    } catch (error) {
        // Retain access to the clicked image if macOS blocks folder enumeration.
        logStage('Folder read failed: ' + String(error.message || error));
        bringToFront();
        ui().displayAlert(PF_TITLE, {
            message: String(error.message || error) + '\n\nСейчас откроется только выбранная картинка.',
            buttons: ['OK'], defaultButton: 'OK'
        });
        openInPreview([selected]);
        return;
    }
    if (!plan.selected) throw new Error('Выбранная картинка больше недоступна:\n' + selected);
    var paths = plan.needsChoice ? chooseSize(plan) : plan.paths;
    openInPreview(paths);
    // Reopening an already-open document asks Preview to bring it forward.
    // It does not create or rewrite image files. Selection behavior can vary
    // between Preview versions, so this is a best-effort focus step only.
    if (paths.length > 1) {
        $.NSThread.sleepForTimeInterval(0.5);
        try { openInPreview([selected]); } catch (ignore) {}
    }
}

function handleDocuments(items) {
    var groups = Object.create(null);
    var folders = [];
    var errors = [];
    var supported = supportedExtensions();
    for (var i = 0; i < items.length; i++) {
        try {
            var path = ObjC.unwrap($(String(items[i])).stringByStandardizingPath);
            if (path.charAt(0) !== '/') throw new Error('Ожидался полный путь к картинке.');
            var info = attributes(path);
            if (!info.regular || deniedExtension(path)) {
                throw new Error('Выбери файл изображения:\n' + path);
            }
            var parent = ObjC.unwrap($(path).stringByDeletingLastPathComponent);
            if (!groups[parent]) { groups[parent] = path; folders.push(parent); }
        } catch (error) { errors.push(String(error.message || error)); }
    }
    for (var j = 0; j < folders.length; j++) {
        try { processFolder(folders[j], groups[folders[j]], supported); }
        catch (error) { if (!isCancelled(error)) errors.push(String(error.message || error)); }
    }
    if (errors.length) throw new Error(errors.join('\n\n'));
    logStage('Completed');
}

function openDocuments(items) {
    beginRun('openDocuments, items=' + items.length);
    try { handleDocuments(items); }
    catch (error) {
        if (isCancelled(error)) logStage('Cancelled by user');
        else showError(error);
    }
}

function reopen() {
    logStage('Reopen requested');
    bringToFront();
}

function nativeCheck(sourcePath) {
    // Executed by the installer on the actual Mac. This verifies the native
    // bridge that a Linux syntax checker cannot exercise. It opens no images.
    if (!sourcePath || !attributes(sourcePath).regular) throw new Error('Native check: source file is missing.');
    var parent = ObjC.unwrap($(sourcePath).stringByDeletingLastPathComponent);
    if (!readFolder(parent).length) throw new Error('Native check: cannot enumerate the source folder.');
    var plan = buildPlan([
        {path: '/10.png', name: '10.png', size: 10, regular: true},
        {path: '/2.png', name: '2.png', size: 10, regular: true},
        {path: '/1.png', name: '1.png', size: 10, regular: true}
    ], '/2.png', {png: true}, compareNames);
    if (plan.paths.join('|') !== '/1.png|/2.png|/10.png') throw new Error('Native check: filename sorting failed.');
    var preview = $.NSWorkspace.sharedWorkspace.URLForApplicationWithBundleIdentifier($(PF_PREVIEW_ID));
    if (!preview || preview.isNil()) throw new Error('Native check: Apple Preview was not found.');
    supportedExtensions();
    return 'PreviewFolder 1.3: native APIs OK.';
}

function run(args) {
    if (args && args[0] === '--check-native') {
        // Do not catch this: the installer needs the original error and exit code.
        return nativeCheck(args[1]);
    }
    beginRun('run');
    try {
        bringToFront();
        logStage('Showing image chooser');
        var file = ui().chooseFile({withPrompt: 'Выбери одну картинку — откроются изображения из её папки.',
                                    ofType: ['public.image'], multipleSelectionsAllowed: false});
        logStage('Image chosen');
        handleDocuments([file]);
    } catch (error) {
        if (isCancelled(error)) logStage('Cancelled by user');
        else showError(error);
    }
}
