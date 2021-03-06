const Clutter = imports.gi.Clutter;
const Lang = imports.lang;
const Cinnamon = imports.gi.Cinnamon;
const St = imports.gi.St;
const Tweener = imports.ui.tweener;
const DND = imports.ui.dnd;
const Meta = imports.gi.Meta;
const SignalManager = imports.misc.signalManager;

const AppletDir = imports.ui.appletManager.applets['IcingTaskManager@json'];

const each = AppletDir.each.each;
const isEqual = AppletDir.isEqual.isEqual;
const constants = AppletDir.constants.constants;
const setTimeout = AppletDir.timers.setTimeout;

// Creates a button with an icon and a label.
// The label text must be set with setText
// @icon: the icon to be displayed
// Button with icon and label.  Click events
// need to be attached manually, but automatically
// highlight when a window of app has focus.

const getPseudoClass = function(pseudoClass) {
  return constants.pseudoOptions.find(function(option) {
    return option.id === pseudoClass;
  }).label;
};

function AppButton () {
  this._init.apply(this, arguments);
}

AppButton.prototype = {

  _init: function (parent) {
    this.app = parent.app;
    this._applet = parent._applet;
    this._parent = parent;
    this.isFavoriteApp = parent.isFavoriteApp;
    this.metaWindow = null;
    this.metaWindows = [];
    this.settings = this._applet.settings;
    this.signals = new SignalManager.SignalManager(this);
    this.hasLabel = this._applet.titleDisplay !== constants.TitleDisplay.None;
    this._progress = 0;
    this.padding = 0;
    this.actor = new St.Bin({
      style_class: 'window-list-item-box',
      reactive: true,
      can_focus: true,
      x_fill: true,
      y_fill: true,
      track_hover: true
    });
    this.progressOverlay = new St.Widget({
      name: 'progressOverlay',
      style_class: 'window-list-item-box',
      reactive: false,
      important: true
    });

    this.actor._delegate = null;
    if (this._applet.orientation === St.Side.TOP) {
      this.actor.add_style_class_name('top');
    } else if (this._applet.orientation === St.Side.BOTTOM) {
      this.actor.add_style_class_name('bottom');
    } else if (this._applet.orientation === St.Side.LEFT) {
      this.actor.add_style_class_name('left');
    } else if (this._applet.orientation === St.Side.RIGHT) {
      this.actor.add_style_class_name('right');
    }
    this._container = new Cinnamon.GenericContainer({
      name: 'iconLabelButton'
    });
    this.actor.set_child(this._container);
    this._container.add_actor(this.progressOverlay);
    // Create the app button icon, number label, and text label for titleDisplay
    this.setActorWidth();
    this._label = new St.Label({
      style_class: 'app-button-label',
      text: ''
    });
    this._numLabel = new St.Label({
      style_class: 'window-list-item-label window-icon-list-numlabel',
    });
    this._numLabel.clutter_text.ellipsize = false;

    this._container.add_actor(this._numLabel);
    this._label.x_align = St.Align.START;
    this._container.add_actor(this._label);

    this.signals.connect(this._container, 'get-preferred-width', Lang.bind(this, this._getPreferredWidth));
    this.signals.connect(this._container, 'get-preferred-height', Lang.bind(this, this._getPreferredHeight));
    this.signals.connect(this._container, 'allocate', Lang.bind(this, this._allocate));
    this.signals.connect(this.actor, 'enter-event', Lang.bind(this, this._onEnter));
    this.signals.connect(this.actor, 'leave-event', Lang.bind(this, this._onLeave));

    this._isFavorite(this.isFavoriteApp);
  },

  setActorWidth: function() {
    if (!this.hasLabel) {
      this.actor.width = this._applet.appButtonWidth;
    }
    this.setIconSize();
    this.setIconPadding();
  },

  setActorHeight: function() {
    if (this._applet.orientation === St.Side.TOP || this._applet.orientation === St.Side.BOTTOM) {
      this.actor.height = this._applet._panelHeight;
    }
  },

  setIconPadding: function () {
    this.themeNode = this.actor.peek_theme_node();
    this.padding = (this.hasLabel ? 0 : Math.floor((this.actor.width - this.iconSize)) / 2);
    const rightPadding = 0;
    this.actor.set_style('padding-left: ' + this.padding + 'px;padding-right: ' + rightPadding + 'px;');
    this.icon.align = St.Align.MIDDLE;
  },

  setIconSize: function () {
    if (this._applet.enableIconSize) {
      this.iconSize = this._applet.iconSize;
    } else if (this._applet._scaleMode) {
      this.iconSize = Math.floor(this._applet._panelHeight * 0.8);
    } else {
      this.iconSize = 24;
    }
    let shouldInsert = false;
    if (this.icon) {
      // The icon scaling isn't working so well on horizontal panels, so we're going to dynamically cap
      // its max value in this situation for now.
      if ((this._applet.orientation === St.Side.TOP || this._applet.orientation === St.Side.BOTTOM)
        && this.iconSize > this._applet._panelHeight) {
        this._applet.settings.setValue('icon-size', this._applet._panelHeight);
        return false;
      }
      shouldInsert = true;
      this.icon.destroy();
    }
    this.icon = this.app.create_icon_texture(this.iconSize);
    if (shouldInsert) {
      this._container.insert_child_at_index(this.icon, 0);
    } else {
      this._container.add_actor(this.icon);
    }
    this.setActorHeight();
  },

  setText: function (text) {
    text = text ? text : '';
    if (text && text.length > 0
      && text.indexOf('null') === -1
      && text.length > 0
      && this._label) {
      this._label.set_text(text);
      if (this._label.is_realized()) {
        this._label.set_style('padding-right: 4px;');
      }
    }
  },

  getAttention: function () {
    if (this._needsAttention) {
      return false;
    }
    this._needsAttention = true;
    let counter = 0;
    this._flashButton(counter);
    return true;
  },

  _flashButton: function (counter) {
    if (!this._needsAttention || !this.actor) {
      return;
    }
    const activePseudoClass = getPseudoClass(this._applet.activePseudoClass);
    if (this._applet.showActive) {
      this.actor.remove_style_pseudo_class(activePseudoClass);
    }
    this.actor.add_style_class_name('window-list-item-demands-attention');
    if (counter < 4) {
      setTimeout(()=>{
        if (this.actor && this.actor.has_style_class_name('window-list-item-demands-attention')) {
          this.actor.remove_style_class_name('window-list-item-demands-attention');
          if (this._applet.showActive) {
            this.actor.add_style_pseudo_class(activePseudoClass);
          }
        }
        setTimeout(()=>{
          this._flashButton(++counter);
        }, constants.FLASH_INTERVAL);
      }, constants.FLASH_INTERVAL);
    }
  },

  _getPreferredWidth: function (actor, forHeight, alloc) {
    let [iconMinSize, iconNaturalSize] = this.icon.get_preferred_width(forHeight);
    let labelNaturalSize = this._label.get_preferred_width(forHeight)[1];
    // The label text starts in the center of the icon, so we should allocate the space
    // needed for the icon plus the space needed for(label - icon/2)
    alloc.min_size = iconMinSize;
    if (this._applet.orientation === St.Side.TOP || this._applet.orientation === St.Side.BOTTOM ) {
      if (this._applet.titleDisplay === 3 && !this._parent.isFavoriteApp) {
        alloc.natural_size = constants.MAX_BUTTON_WIDTH;
      } else {
        alloc.natural_size = Math.min(iconNaturalSize + Math.max(0, labelNaturalSize), constants.MAX_BUTTON_WIDTH);
      }
    } else {
      alloc.natural_size = this._applet._panelHeight;
    }
  },

  _getPreferredHeight: function (actor, forWidth, alloc) {
    let [iconMinSize, iconNaturalSize] = this.icon.get_preferred_height(forWidth);
    let [labelMinSize, labelNaturalSize] = this._label.get_preferred_height(forWidth);
    alloc.min_size = Math.min(iconMinSize, labelMinSize);
    alloc.natural_size = Math.max(iconNaturalSize, labelNaturalSize);
  },

  _allocate: function (actor, box, flags) {
    // returns [x1,x2] so that the area between x1 and x2 is
    // centered in length

    function center (length, naturalLength) {
      let maxLength = Math.min(length, naturalLength);
      let x1 = Math.max(0, Math.floor((length - maxLength) / 2));
      let x2 = Math.min(length, x1 + maxLength);
      return [x1, x2];
    }
    let allocWidth = box.x2 - box.x1;
    let allocHeight = box.y2 - box.y1;
    let childBox = new Clutter.ActorBox();
    let direction = this.actor.get_text_direction();

    // Set the icon to be left-justified (or right-justified) and centered vertically
    let [iconNaturalWidth, iconNaturalHeight] = this.icon.get_preferred_size();
    [childBox.y1, childBox.y2] = center(allocHeight, iconNaturalHeight);
    if (direction === Clutter.TextDirection.LTR) {
      [childBox.x1, childBox.x2] = [0, Math.min(iconNaturalWidth, allocWidth)];
    } else {
      [childBox.x1, childBox.x2] = [Math.max(0, allocWidth - iconNaturalWidth), allocWidth];
    }
    this.icon.allocate(childBox, flags);

    // Set the label to start its text in the left of the icon
    let iconWidth = childBox.x2 - childBox.x1;
    let [naturalWidth, naturalHeight] = this._label.get_preferred_size();
    [childBox.y1, childBox.y2] = center(allocHeight, naturalHeight);
    if (direction === Clutter.TextDirection.LTR) {
      childBox.x1 = iconWidth;
      childBox.x2 = Math.min(allocWidth, constants.MAX_BUTTON_WIDTH);
    } else {
      childBox.x2 = Math.min(allocWidth - iconWidth, constants.MAX_BUTTON_WIDTH);
      childBox.x1 = Math.max(0, childBox.x2 - naturalWidth);
    }
    this._label.allocate(childBox, flags);
    if (direction === Clutter.TextDirection.LTR) {
      childBox.x1 = -3;
      childBox.x2 = childBox.x1 + this._numLabel.width;
      childBox.y1 = box.y1 - 2;
      childBox.y2 = box.y2 - 1;
    } else {
      childBox.x1 = -this._numLabel.width;
      childBox.x2 = childBox.x1 + this._numLabel.width;
      childBox.y1 = box.y1;
      childBox.y2 = box.y2 - 1;
    }
    this._numLabel.allocate(childBox, flags);

    // Call set_icon_geometry for support of Cinnamon's minimize animation
    if (this.metaWindows.length > 0 && this._container.get_stage()) {
      let rect = new Meta.Rectangle();
      [rect.x, rect.y] = this._container.get_transformed_position();
      [rect.width, rect.height] = this._container.get_transformed_size();

      each(this.metaWindows, (metaWindow)=>{
        if (metaWindow) {
          metaWindow.set_icon_geometry(rect);
        }
      });
    }

    if (this.progressOverlay.visible) {
      childBox.x1 = -this.padding;
      childBox.y1 = 0;
      childBox.y2 = this._container.height;
      childBox.x2 = Math.max(this._container.width * (this._progress / 100.0), 1.0);
      this.progressOverlay.allocate(childBox, flags);
    }
  },
  showLabel: function () {
    if (!this._label) {
      return false;
    }
    if (!this._label.text) {
      this._label.set_text('');
    }
    this._label.show();
    Tweener.addTween(this._label, {
      width: constants.MAX_BUTTON_WIDTH, // Should probably check preferred width
      time: constants.BUTTON_BOX_ANIMATION_TIME,
      transition: 'easeOutQuad'
    });
    return false;
  },

  hideLabel: function (animate) {
    if (!this._label) {
      return false;
    }
    if (!this._label.text) {
      this._label.set_text('');
    }
    if (!animate) {
      this._label.width = 1;
      this._label.hide();
      return false;
    }

    Tweener.addTween(this._label, {
      width: 1,
      time: constants.BUTTON_BOX_ANIMATION_TIME,
      transition: 'easeOutQuad',
      onCompleteScope: this,
      onComplete: function () {
        this._label.hide();
      }
    });
    return false;
  },

  _onEnter: function(){
    if (this._applet.panelEditMode) {
      return false;
    }
    let hoverPseudoClass = getPseudoClass(this._applet.hoverPseudoClass);
    if (!this.actor.has_style_pseudo_class(hoverPseudoClass)) {
      this.actor.add_style_pseudo_class(hoverPseudoClass);
    }
  },

  _onLeave: function(){
    if (this._applet.panelEditMode) {
      return false;
    }
    this.actor.remove_style_pseudo_class(getPseudoClass(this._applet.hoverPseudoClass));
    this._setFavoriteAttributes();
  },

  setActiveStatus: function(windows){
    let pseudoClass = getPseudoClass(this._applet.activePseudoClass);
    if (windows.length > 0 && !this.actor.has_style_pseudo_class(pseudoClass)) {
      this.actor.add_style_pseudo_class(pseudoClass);
    } else {
      this.actor.remove_style_pseudo_class(pseudoClass);
    }
  },

  setMetaWindow: function (metaWindow, metaWindows) {
    this.metaWindow = metaWindow;
    this.metaWindows = metaWindows;
  },

  _onProgressChange: function(metaWindow) {
    if (metaWindow.progress !== this._progress) {
      this._progress = metaWindow.progress;
      if (this._progress > 0) {
        this.progressOverlay.visible = true;
        this.progressOverlay.add_style_pseudo_class('progress');
      } else {
        this.progressOverlay.remove_style_pseudo_class('progress');
      }
      this._container.queue_relayout();
    }
  },

  _onFocusChange: function () {
    // If any of the windows associated with our app have focus,
    // we should set ourselves to active
    let focusPseudoClass = getPseudoClass(this._applet.focusPseudoClass);
    if (this._hasFocus()) {
      this.actor.add_style_pseudo_class(focusPseudoClass);
      if (this.actor.has_style_class_name('window-list-item-demands-attention')) {
        this.actor.remove_style_class_name('window-list-item-demands-attention');
      }
      if (this.actor.has_style_class_name('window-list-item-demands-attention-top')) {
        this.actor.remove_style_class_name('window-list-item-demands-attention-top');
      }
      this._needsAttention = false;
    } else {
      this.actor.remove_style_pseudo_class(focusPseudoClass);
    }
    if (this._applet.showActive && this.metaWindows.length > 0) {
      this.actor.add_style_pseudo_class(getPseudoClass(this._applet.activePseudoClass));
    }
  },

  _hasFocus: function () {
    let hasTransient = false;
    let handleTransient = function(transient){
      if (transient.has_focus()) {
        hasTransient = true;
        return false;
      }
      return true;
    };
    each(this.metaWindows, (win)=>{
      if (win.minimized) {
        return true;
      }
      if (win.has_focus()) {
        hasTransient = true;
        return false;
      }
      win.foreach_transient(handleTransient);
    });
    return hasTransient;
  },

  _onWindowDemandsAttention: function (window) {
    let windows = this.app.get_windows();
    for (let i = 0, len = windows.length; i < len; i++) {
      if (isEqual(windows[i], window)) {
        this.getAttention();
        return true;
      }
    }
    return false;
  },

  _setFavoriteAttributes: function () {
    if (!this.app) {
      return;
    }
    if (this.app.state === 0 && this.isFavoriteApp) {
      let pseudoClass = getPseudoClass(this._applet.activePseudoClass);
      if (this.actor.has_style_class_name('window-list-item-box')) {
        this.actor.remove_style_class_name('window-list-item-box');
      }
      if (this.actor.has_style_pseudo_class(pseudoClass)) {
        this.actor.remove_style_pseudo_class(pseudoClass);
      }
    } else if (!this.actor.has_style_class_name('window-list-item-box')) {
      this.actor.add_style_class_name('window-list-item-box');
    }
  },

  _isFavorite: function (isFav) {
    this.isFavoriteApp = isFav;
    this._setFavoriteAttributes();
    this._onFocusChange();
  },

  destroy: function () {
    this.signals.disconnectAllSignals();
    this._container.destroy();
    this.actor.destroy();
    let props = Object.keys(this);
    each(props, (propKey)=>{
      this[propKey] = undefined;
    });
  }
};

function _Draggable (actor, params) {
  this._init(actor, params);
}

_Draggable.prototype = {
  __proto__: DND._Draggable.prototype,

  _grabActor: function () {
        // Clutter.grab_pointer(this.actor);
    this._onEventId = this.actor.connect('event', Lang.bind(this, this._onEvent));
  },
  _onButtonPress: function (actor, event) {
    if (this.inhibit) {
      return false;
    }

    if (event.get_button() !== 1) {
      return false;
    }

    if (Tweener.getTweenCount(actor)) {
      return false;
    }

    this._buttonDown = true;
    this._grabActor();

    let [stageX, stageY] = event.get_coords();
    this._dragStartX = stageX;
    this._dragStartY = stageY;

    return false;
  },
};

function makeDraggable (actor, params) {
  return new _Draggable(actor, params);
}
