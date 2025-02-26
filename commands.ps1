param([string]$type, [string]$Configuration = "Release")

$ErrorActionPreferenceOld = $ErrorActionPreference;
$ErrorActionPreference = "Stop";

$DeployPath = $type -eq "build-dev" ? "vortex_devel/plugins" : "vortex/plugins"
$type = $type -eq "build-dev" ? "build" : $type;

try {
    # Clean
    if ($type -eq "build" -or $type -eq "build-extended" -or $type -eq "build-update" -or $type -eq "clear") {
        Write-Host "Clean";
        Remove-Item *.7z, dist -Recurse -Force -ErrorAction Ignore;
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
            npx extractInfo;
        }
    }
    # 7z
    if ($type -eq "build" -or $type -eq "build-extended" -or $type -eq "build-update" -or $type -eq "build-7z") {
        Write-Host "Pack 7z";

        Invoke-Command -ScriptBlock {
            7z a -t7z "game-mount-and-blade2.7z" "./dist/*.*";
        }
    }
    # Copy to Vortex if available
    if ($type -eq "build" -or $type -eq "build-extended" -or $type -eq "build-update" -or $type -eq "build-webpack" -or $type -eq "build-7z") {
        # TODO: On linux won't work
        try {
            if (-not (Test-Path -Path "/vortex-plugins")) {
                # Create a folder junction named /vortex-plugins pointing to %appdata%/vortex_devel/plugins
                $appDataPath = [System.Environment]::GetFolderPath([System.Environment+SpecialFolder]::ApplicationData)
                $junctionPath = "/vortex-plugins"
                $targetPath = Join-Path $appDataPath $DeployPath
      
                if (-not (Test-Path $junctionPath -PathType Container)) {
                    New-Item -ItemType Junction -Path $junctionPath -Target $targetPath
                    Write-Host "Created folder junction at $junctionPath pointing to $targetPath"
                } else {
                    Write-Host "Folder junction already exists at $junctionPath"
                }
              }
              Write-Host "Copy dist to Vortex plugins mount";
              Remove-Item "/vortex-plugins/bannerlord" -Recurse -Force -ErrorAction Ignore;
              Copy-Item "./dist" -Destination "/vortex-plugins/bannerlord" -Recurse;
        }
        catch {
        }
    }
}
finally {
    $ErrorActionPreference = $ErrorActionPreferenceOld;
}
