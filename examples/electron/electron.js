const { app, BrowserWindow } = require('electron');

function createWindow()
{
  // create the browser window
  const mainWindow = new BrowserWindow({width: 800, height: 600});
  
  // hide the toolbar menu
  mainWindow.setMenu(null);

  // load the index.html of the app
  mainWindow.loadFile('index.html');

  // go fullscreen
  //mainWindow.setFullScreen(true);

  // open the dev tools debugging
  //mainWindow.webContents.openDevTools()
}

// wait until the app is ready and create the window
app.whenReady().then(createWindow);

// quit when all windows are closed (except macOS convention)
app.on('window-all-closed', ()=>
{
    if (process.platform != 'darwin')
        app.quit();
});

app.on('activate', ()=>
{
    if (BrowserWindow.getAllWindows().length == 0)
        createWindow();
});