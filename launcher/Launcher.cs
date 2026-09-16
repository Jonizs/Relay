// Tiny native launcher: starts Electron against the project folder so the game
// runs from the live source tree. Built by launcher/build.ps1 (uses the csc.exe
// bundled with Windows – no Visual Studio needed).
using System;
using System.Diagnostics;
using System.IO;
using System.Windows.Forms;

static class Launcher
{
    // Replaced by build.ps1 with the absolute project path.
    const string ProjectRoot = @"__PROJECT_ROOT__";

    [STAThread]
    static void Main(string[] args)
    {
        string electron = Path.Combine(ProjectRoot, @"node_modules\electron\dist\electron.exe");

        if (!File.Exists(electron))
        {
            MessageBox.Show(
                "Electron was not found at:\n" + electron +
                "\n\nOpen a terminal in the project folder and run:\n    npm install",
                "2DPIT", MessageBoxButtons.OK, MessageBoxIcon.Error);
            return;
        }

        // Forward any args (e.g. --prod) through to Electron.
        string extra = args.Length > 0 ? " " + string.Join(" ", args) : "";

        var psi = new ProcessStartInfo
        {
            FileName = electron,
            Arguments = "\"" + ProjectRoot + "\"" + extra,
            WorkingDirectory = ProjectRoot,
            UseShellExecute = false,
        };

        try
        {
            Process.Start(psi);
        }
        catch (Exception ex)
        {
            MessageBox.Show("Failed to start the game:\n" + ex.Message, "2DPIT",
                MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
