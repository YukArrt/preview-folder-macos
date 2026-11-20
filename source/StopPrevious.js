/* Only stop this launcher's previous instance; never Apple Preview. */
ObjC.import('AppKit');
ObjC.import('Foundation');

function run() {
    var apps = $.NSRunningApplication.runningApplicationsWithBundleIdentifier('org.local.PreviewFolderLauncher');
    for (var i = 0; i < Number(apps.count); i++) {
        var app = apps.objectAtIndex(i);
        app.terminate;
    }
    for (var attempt = 0; attempt < 20; attempt++) {
        var pending = false;
        for (var j = 0; j < Number(apps.count); j++) {
            if (!apps.objectAtIndex(j).terminated) pending = true;
        }
        if (!pending) return 'Previous launcher stopped.';
        $.NSThread.sleepForTimeInterval(0.1);
    }
    // The launcher edits no documents and may be stuck in an invisible chooser.
    for (var k = 0; k < Number(apps.count); k++) {
        var remaining = apps.objectAtIndex(k);
        if (!remaining.terminated) remaining.forceTerminate;
    }
    return 'Previous launcher closed.';
}
