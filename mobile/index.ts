import { registerRootComponent } from "expo";
import { registerWidgetTaskHandler } from "react-native-android-widget";
import App from "./App";
import { handleWidgetTask } from "./src/android-widgets";

registerWidgetTaskHandler(handleWidgetTask);
registerRootComponent(App);
