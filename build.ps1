$ExtensionBasePath = "../Bannerlord.LauncherManager";
$ExtensionPath = "$ExtensionBasePath\src\Bannerlord.LauncherManager.Native.TypeScript";

Invoke-Command -ScriptBlock {
   npm run clean;
   npm remove @butr/vortexextensionnative;
}

if (Test-Path "$ExtensionPath") {
   Push-Location "$ExtensionPath";
   try {
      Invoke-Command -ScriptBlock {
         npm run clean;
         npm run build -- Release;
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
} else {
   Invoke-Command -ScriptBlock {
      npm i @butr/vortexextensionnative;
  }
}

Invoke-Command -ScriptBlock {
   npm run build-pack;
   npm run bundle7z;
}