/* Invoked by the installer on macOS; no Preview preference changes. */
ObjC.import('Foundation');

function run(args) {
    if (args.length !== 1) throw new Error('Expected app bundle path.');
    var plistPath = args[0] + '/Contents/Info.plist';
    var info = $.NSMutableDictionary.alloc.initWithContentsOfFile($(plistPath));
    if (!info || info.isNil()) throw new Error('Cannot read app Info.plist.');
    function set(key, value) { info.setObjectForKey($(value), $(key)); }
    set('CFBundleIdentifier', 'org.local.PreviewFolderLauncher');
    set('CFBundleName', 'Просмотр папки');
    set('CFBundleDisplayName', 'Просмотр папки');
    set('CFBundleShortVersionString', '1.3');
    set('CFBundleVersion', '4');
    set('LSMinimumSystemVersion', '10.13');
    set('LSUIElement', false);
    set('NSHighResolutionCapable', true);
    set('NSDesktopFolderUsageDescription', 'Чтобы открыть картинки из той же папки на Рабочем столе.');
    set('NSDocumentsFolderUsageDescription', 'Чтобы открыть картинки из той же папки в Документах.');
    set('NSDownloadsFolderUsageDescription', 'Чтобы открыть картинки из той же папки в Загрузках.');
    set('NSRemovableVolumesUsageDescription', 'Чтобы открыть картинки из той же папки на подключённом диске.');
    set('NSNetworkVolumesUsageDescription', 'Чтобы открыть картинки из той же папки на сетевом диске.');
    set('NSAppleEventsUsageDescription', 'Чтобы прочитать выбранную сортировку открытой папки Finder и передать картинки «Просмотру» в том же порядке.');

    var type = $.NSMutableDictionary.alloc.init;
    type.setObjectForKey($('Изображения'), $('CFBundleTypeName'));
    type.setObjectForKey($('Viewer'), $('CFBundleTypeRole'));
    type.setObjectForKey($('Alternate'), $('LSHandlerRank'));
    type.setObjectForKey($(['public.image']), $('LSItemContentTypes'));
    var types = $.NSMutableArray.array;
    types.addObject(type);
    info.setObjectForKey(types, $('CFBundleDocumentTypes'));
    if (!info.writeToFileAtomically($(plistPath), true)) throw new Error('Cannot save app Info.plist.');
    return 'Bundle configured.';
}
