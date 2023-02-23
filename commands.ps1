param([string]$type, [string]$Configuration = "Release")

$ErrorActionPreferenceOld = $ErrorActionPreference;
$ErrorActionPreference = "Stop";

try {
    # Clean
    if ($type -eq "build" -or $type -eq "build-extended" -or $type -eq "build-update" -or $type -eq "clear") {
        Write-Host "Clean";
        Remove-Item *.tgz, *.7z, dist -Recurse -Force -ErrorAction Ignore;
    }
    # Update @butr/vortexextensionnative from File
    if ($type -eq "build-extended") {
        Write-Host "Updating @butr/vortexextensionnative from File";

        $ExtensionBasePath = "../Bannerlord.LauncherManager";
        $ExtensionPath = "$ExtensionBasePath/src/Bannerlord.LauncherManager.Native.TypeScript";

        Invoke-Command -ScriptBlock {
            npm remove @butr/vortexextensionnative;
        }

        Push-Location "$ExtensionPath";
        try {
            Invoke-Command -ScriptBlock {
                npm run clean;
                npm run build -- $Configuration;
                npm pack;
            }
        }
        catch {
            exit;
        }
        finally {
            Pop-Location;
            Copy-Item -Path "$ExtensionPath\butr-vortexextensionnative-1.0.0.tgz" -Destination $ThisPath;
            Invoke-Command -ScriptBlock {
                npm i ./butr-vortexextensionnative-1.0.0.tgz;
            }
        }
    }
    # Update @butr/vortexextensionnative from NPM
    if ($type -eq "build-update") {
        Write-Host "Updating @butr/vortexextensionnative from NPM";

        Invoke-Command -ScriptBlock {
            npx tsc -p tsconfig.json;
            npx tsc -p tsconfig.module.json;
        }
    }
    # Webpack
    if ($type -eq "build" -or $type -eq "build-extended" -or $type -eq "build-update" -or $type -eq "build-webpack") {
        Write-Host "Webpack";

        Invoke-Command -ScriptBlock {
            npx webpack --config webpack.config.js --color;
        }
    }
    # 7z
    if ($type -eq "build" -or $type -eq "build-extended" -or $type -eq "build-update" -or $type -eq "build-7z") {
        Write-Host "Pack 7z";

        Invoke-Command -ScriptBlock {
            npx extractInfo;
            7z a -t7z "game-mount-and-blade2.7z" "./dist/*.*";
        }
    }
    # Copy to Vortex if available
    if ($type -eq "build" -or $type -eq "build-extended" -or $type -eq "build-update" -or $type -eq "build-webpack" -or $type -eq "build-7z") {
        if (Test-Path -Path "/vortex-plugins/game-mount-and-blade2") {
            Write-Host "Copy dist to Vortex plugins mount";
            Copy-Item "./dist" -Destination "/vortex-plugins/game-mount-and-blade2"
        }
    }
}
finally {
    $ErrorActionPreference = $ErrorActionPreferenceOld;
}
