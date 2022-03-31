import React, {Component} from 'react';
import {
  StyleSheet,
  View,
  BackHandler,
  SafeAreaView,
  ImageBackground,
  Text,
  Keyboard,
  Animated,
  Platform,
  TouchableOpacity,
  Alert,
} from 'react-native';
import {GiftedChat, Day} from 'react-native-gifted-chat';
import {socket} from '../../../sockets/connection';
import {regex} from '../../../utils/regex';
import Toast from 'react-native-simple-toast';
import FontAwesome from 'react-native-vector-icons/dist/FontAwesome5';
import DeviceInfo from 'react-native-device-info';

//Components
import HomeHeader from '../../../components/HomeHeader';
import MediaOptions from '../../../components/MediaOptions';
import Stickers from '../../../components/Stickers';
import MediaUpload from '../../../components/MediaUpload';

//Screens
import MessageItem from './MessageItem';
import MessageInputToolBar from './MessageInputToolBar';

//Services
import WebSockits from '../../../services/WebSockits';
import moment from 'moment';

//Redux
import {
  setSickerOpen,
  setMediaOptionsOpen,
  setOnLongPress,
  setReplyState,
  setReplyNavigate,
  setSearchQuery,
  setSearchState,
  setSearchShow,
  setMessageEdit,
  setMessageText,
} from '../../../store/actions';
import {connect} from 'react-redux';

//DataBase
import {
  MessagesQuieries,
  ChatUsersQuieries,
} from '../../../database/services/Services';
import ChatServices from '../../../services/ChatServices';

var renderchangedate = '';
class MessageScreen extends Component {
  constructor(props) {
    super(props);
    this.state = {
      messages: [],
      chatUserOnlineStatus: [{online_status: 1}],
      typingStatus: false,
      navIndex: -1,
      highlightIndex: 0,
      isEdited: false,
      keyboardOffset: new Animated.Value(0),
      minInputToolbarHeight: 62,
      offset: 0,
      searchOffsetTop: 0,
      searchOffsetBottom: 0,
      isInverted: true,
      shouldScrollToIndex: true,
      msgDate: '',
      showStickDate: false,
      fadeAnimation: new Animated.Value(0),
      unreadMessages: [],
      isFirstLoading: true,
      showDownBtn: false,
    };
  }

  componentDidMount = () => {
    console.log('socket', socket.connected);
    let str = DeviceInfo.getModel();
    if (socket.connected) {
      this.socketRun();
    } else {
      Alert.alert('Disoconnected server', 'Connection Server error');
    }
    if (this.props.route.params.screen == 'seacrhTab')
      this.getSearchOffset(this.props.route.params.selectedUser);
    else this.getAllMsgsFromDb();

    BackHandler.addEventListener('hardwareBackPress', this.hardwareBack);
    this.keyboardDidShowListener = Keyboard.addListener(
      'keyboardWillShow',
      e => {
        Animated.spring(this.state.keyboardOffset, {
          toValue:
            Platform.OS == 'ios'
              ? str.slice(7, 9) > 8 ||
                str.slice(7, 9)?.includes('X') ||
                str.slice(7, 9)?.includes('x')
                ? e.endCoordinates.height - 34
                : e.endCoordinates.height
              : e.endCoordinates.height,
          friction: 10,
        }).start();
      },
    );
    this.keyboardDidHideListener = Keyboard.addListener(
      'keyboardWillHide',
      e => {
        Animated.spring(this.state.keyboardOffset, {
          toValue: 0,
          friction: 15,
        }).start();
      },
    );
  };

  getKeyboardHeight = e => {
    console.log('Device Model', DeviceInfo.getModel());
  };
  getSearchOffset = params => {
    let onlineUserId = params.online_user_id;
    let chatUserId = params.user_id;
    let isroom = params.is_room;
    let msgId = params._id;
    MessagesQuieries.getMessageOffset(
      {onlineUserId, chatUserId, isroom, msgId},
      async res => {
        this.setState({
          searchOffsetTop: res - 20,
          searchOffsetBottom: res - 20,
        });
        this.getSearchedMessages(params);
      },
    );
  };

  getSearchedMessages = params => {
    let onlineUserId = params.online_user_id;
    let chatUserId = params.user_id;
    let isroom = params.is_room;
    let msgId = params._id;
    let msgSearch = params.message;
    let offset = this.state.isInverted
      ? this.state.searchOffsetBottom
      : this.state.searchOffsetTop;
    MessagesQuieries.getSearchBasedMsgs(
      {onlineUserId, chatUserId, isroom, msgId, msgSearch, offset},
      res => {
        if (res !== null) {
          this.setMessageAsGifted(res);
          let ind = this.state.messages.findIndex(
            x => parseInt(x._id) === parseInt(msgId),
          );
          if (ind !== -1) {
            this.setState({
              highlightIndex: this.state.messages[ind].id,
              navIndex: ind,
            });
          }
        }
      },
    );
  };

  getAllMsgsFromDb = () => {
    let offset = this.state.offset;
    let onlineUserId = this.props.user?.user.id;
    let chatUserId = 0;
    let isroom =
      this.props?.route?.params.selectedUser.is_room == 0
        ? 0
        : this.props?.route?.params.selectedUser.is_room == 1
        ? 1
        : 1;
    if (this.props?.route?.params?.selectedUser?.user_id === undefined) {
      chatUserId = this.props?.route?.params.selectedUser.id;
    } else {
      chatUserId = this.props?.route?.params.selectedUser.user_id;
    }

    MessagesQuieries.selectDb(
      {onlineUserId, chatUserId, isroom, offset},
      res2 => {
        if (res2 !== null) {
          if (this.state.isFirstLoading) {
            let tempUnread = [];
            for (let index = 0; index < res2.length; index++) {
              const element = res2[index];
              if (
                (element.is_read === 0 || element.is_read === null) &&
                element.sender_id !== onlineUserId
              ) {
                tempUnread.push(element);
              } else {
                break;
              }
            }

            this.setState({
              unreadMessages: tempUnread.reverse(),
            });
            this.setMessageAsGifted(res2);
          } else {
            this.setMessageAsGifted(res2);
          }
        }
      },
    );
  };

  componentWillUnmount = () => {
    socket.off('message_saved');
    socket.off('users_online_status');
    socket.off('typing_on_off_user');
    this.subscribeToMessages?.unsubscribe?.();
    this.subscribeToMessagesUpdate?.unsubscribe?.();
    BackHandler.removeEventListener('hardwareBackPress', this.hardwareBack);
    // this.setState({messages : []})
    // this.keyboardDidShowListener.remove();
    // this.keyboardDidHideListener.remove()
  };
  _keyboardDidShow = event => {
    this.setState({
      keyboardOffset: event.endCoordinates.height,
    });
  };

  _keyboardDidHide() {
    this.setState({
      keyboardOffset: 0,
    });
  }
  hardwareBack = () => {
    if (this.props?.longPress.length) {
      this.props.onSetReplyState(false);
      this.props.onSetMessageEdit(false);
      this.props.onSetMessageText(null);
      this.props.onSetOnLongPress([]);
      this.props.onSetMediaOptionsOpen(false);
      this.props.onSetSickerOpen(false);
    } else if (this.props.searchShow) {
      this.props.onSetSearchShow(false);
      this.props.onSetSearchState(false);
      this.props.onSetSearchQuery('');
      this.setSearchResponse('');
    } else if (this.props.stickerOpen) {
      this.props.onSetSickerOpen(false);
      this.props.onSetMediaOptionsOpen(false);
    } else if (this.props.mediaOptionsOpen) {
      this.props.onSetMediaOptionsOpen(false);
    } else {
      this.props.onSetMessageText(null);
      this.props.navigation.replace('Home');
    }

    return true;
  };

  setSearchResponse = data => {
    if (data === '') {
      this.getAllMsgsFromDb();
    } else {
      this.setMessageAsGifted(data);
    }
  };

  filterResponse = data => {
    if (data == null || data.length == 0) {
      // this.getAllMsgsFromDb();
      this.setMessageAsGifted([]);
    } else {
      this.setMessageAsGifted(data, false, true);
    }
  };

  socketRun() {
    // New Message Recieved
    this.subscribeToMessages = WebSockits.subscribeToMessages(msg => {
      let onlineUserId = this.props.user.user.id;
      let isRoom = msg.chat.room_id == undefined ? 0 : 1;
      let chatUserId =
        msg.chat.room_id == undefined ? msg.chat.user_1 : msg.chat.room_id;
      let msgId = msg.chat.id;
      MessagesQuieries.checkMessageExsistMessageScreen(
        {onlineUserId, isRoom, chatUserId, msgId},
        res3 => {
          if (msg !== undefined && res3 == false) {
            if (msg !== undefined) {
              if (
                msg.chat.sender_id ===
                  this.props?.route?.params.selectedUser?.user_id &&
                msg.chat.chat_type === 'private' &&
                this.props?.route?.params.selectedUser.is_room == 0
              ) {
                let message = regex.getMessages(
                  msg.chat,
                  this.props?.route?.params.selectedUser,
                  this.props.user?.user,
                );
                this.setState(previousState => ({
                  messages: GiftedChat.append(previousState.messages, [
                    message,
                  ]),
                }));
                // this.markMessagesAsRead([message]);
                this.UpdateMessageRuntime(msg, message);
              } else if (
                msg.chat?.room_id ===
                  this.props?.route?.params.selectedUser?.user_id &&
                msg.chat?.chat_type === 'group' &&
                this.props?.route?.params.selectedUser.is_room == 1
              ) {
                let message = regex.getMessages(
                  msg.chat,
                  this.props?.route?.params.selectedUser,
                  this.props.user?.user,
                );
                this.setState(previousState => ({
                  messages: GiftedChat.append(previousState.messages, [
                    message,
                  ]),
                }));

                this.UpdateMessageRuntime(msg, message);
              }
            }
          }
        },
      );
    });

    // New Message Send
    socket.on('message_saved', status => {
      let tableName = 'messages_list_table';
      MessagesQuieries.savedMessageUpdate({tableName, status}, res3 => {
        for (var a = 0; a < this.state.messages.length; ++a) {
          if (this.state.messages[a].id === status.random_id) {
            this.state.messages[a].id = status.id;
            this.state.messages[a]._id = status.id;
            this.state.messages[a].time = status.time;
            this.state.messages[a].updated_at = status.time;
            this.state.messages[a].status = 0;
            break;
          }
        }

        this.setState({messages: this.state.messages});

        var data = {};
        data['user_list_sec'] = 'recent';
        data['current_user'] = this.props.user?.user.id;
        socket.emit('user_list', JSON.stringify(data));
        socket.on('user_list_change', async res => {
          ChatUsersQuieries.insertAndUpdateUserList(
            'users_list_table',
            res?.chat_list,
            this.props?.user?.user.id,
            res => {},
          );
          socket.off('user_list');
          socket.off('user_list_change');
        });
      });
    });

    // Update Message Run Time
    this.subscribeToMessagesUpdate = WebSockits.subscribeToMessagesUpdate(
      Payload => {
        setTimeout(() => {
          let onlineUserId = this.props.user?.user.id;
          let chatUserId = this.props?.route?.params?.selectedUser.user_id;
          let id = Payload?.chat?.id;
          MessagesQuieries.selectDbById({onlineUserId, chatUserId, id}, res => {
            let element = res?.[0];
            element.status = Payload?.chat?.status;
            element.time = Payload?.chat?.time;
            element.updated_at = Payload?.chat?.updated_at;

            // Update Msg from Db
            let newMessageArray = {
              data: {
                data: [
                  {
                    chats: [element],
                    is_room: element.is_room,
                    room_id: element.is_room === 1 ? element.chatUser : null,
                    user_id: element.is_room === 0 ? element.chatUser : null,
                  },
                ],
              },
            };
            for (var a = 0; a < this.state.messages.length; ++a) {
              if (this.state.messages[a].id === Payload?.chat?.id) {
                if (Payload.action === 'edit') {
                  this.state.messages[a].is_edited = Payload?.chat?.is_edited;
                  this.state.messages[a].status = Payload?.chat.status;
                  this.state.messages[a].message = Payload?.chat?.message;
                  this.state.messages[a].type = Payload?.chat?.type;
                  this.state.messages[a].updated_at = Payload?.chat?.updated_at;
                  this.state.messages[a].time = Payload?.chat?.time;
                  newMessageArray.data.data[0].chats[0].message =
                    Payload?.chat?.message;
                  newMessageArray.data.data[0].chats[0].type =
                    Payload?.chat?.type;
                  newMessageArray.data.data[0].chats[0].is_edited =
                    Payload?.chat?.is_edited;
                  this.setState({
                    messages: this.state.messages,
                    isEdited: true,
                  });
                  // this.setMessageAsGifted(this.state.messages);
                  this.setState({isEdited: false});
                } else if (Payload?.action == 'acknowledge') {
                  this.state.messages[a].ack_required =
                    Payload?.chat?.ack_required;
                  newMessageArray.data.data[0].chats[0].ack_required =
                    Payload?.chat?.ack_required;
                  // this.setState({messages: this.state.messages});
                  // this.setMessageAsGifted(this.state.messages);
                } else {
                  this.state.messages[a].status =
                    Payload?.action === 'delivered'
                      ? 1
                      : Payload?.action === 'seen'
                      ? 2
                      : Payload?.action === 'delete'
                      ? 3
                      : 0;
                  this.state.messages[a].updated_at = Payload?.chat?.updated_at;
                  this.state.messages[a].time = Payload?.chat?.time;
                  // this.setState({messages: this.state.messages});
                  // this.setMessageAsGifted(this.state.messages);
                }
                break;
              }
            }
            this.setMessageAsGifted(this.state.messages);
            let tableName = 'messages_list_table';
            let resp = newMessageArray;
            let onlineUserId = this.props.user?.user.id;
            MessagesQuieries.updateDbAtcion(
              {tableName, resp, onlineUserId},
              res3 => {},
            );
          });
        }, 250);
      },
    );

    // User Online Status
    socket.on('users_online_status', msg => {
      this.setState({chatUserOnlineStatus: msg});
    });

    // Message Typing Screen
    socket.on('typing_on_off_user', status => {
      if (status.typing_status === 'on') {
        if (
          this.props?.route?.params.selectedUser.user_id === status.chat_user
        ) {
          this.setState({typingStatus: true});
        }
      } else {
        this.setState({typingStatus: false});
      }
    });
  }

  UpdateMessageRuntime = (Payload, message) => {
    let newMessageArray = {
      data: {
        data: [
          {
            chats: [Payload.chat],
            is_room: Payload.chat?.chat_type == 'private' ? 0 : 1,
            room_id:
              Payload.chat?.chat_type == 'private'
                ? null
                : Payload.chat?.room_id,
            user_id:
              Payload.chat?.chat_type == 'private'
                ? Payload.chat?.sender_id
                : null,
          },
        ],
      },
    };
    let tableName = 'messages_list_table';
    let resp = newMessageArray;
    let onlineUserId = this.props.user?.user.id;
    MessagesQuieries.insertAndUpdateMessageList(
      {tableName, resp, onlineUserId},
      res3 => {
        // this.getAllMsgsFromDb();
        this.markMessagesAsRead([message]);
      },
    );
  };

  setMessageAsGifted = async (
    data,
    isMsgReadFirst = false,
    isSearchedData = false,
  ) => {
    // this.setState({messages:[]})
    const {selectedUser} = this.props?.route?.params;
    let dummyArray = [];
    data.forEach(element => {
      let message = regex.getMessages(
        element,
        selectedUser,
        this.props.user?.user,
      );
      dummyArray.push(message);
    });
    if (isSearchedData) {
      await this.setState({messages: dummyArray});
    } else {
      if (this.state.isInverted) {
        this.setState({messages: dummyArray, isInverted: false});
      } else {
        this.setState({messages: [...this.state.messages, ...dummyArray]});
      }
    }

    this.props.onSetOnLongPress([]);
    if (isMsgReadFirst) {
      this.markMessagesAsRead(dummyArray);
    }
  };

  onSendMessage = (messages, messageType, isEdit = false) => {
    const {selectedUser} = this.props?.route?.params;
    let sendMessage =
      this.props.replyState && !isEdit
        ? regex.sendReplyMessage(this.props.longPress[0], messages, messageType)
        : messages;
    let idx =
      this.state.messages[0]?.idx == undefined
        ? 0
        : this.state.messages[0]?.idx + 1;
    let randomId = !isEdit
      ? Math.random() + 'random'
      : this.props.longPress[0].id;
    let message = regex.sendMessage(
      selectedUser,
      randomId,
      this.props.replyState && !isEdit ? 8 : messageType,
      idx,
      this.props.user?.user,
      sendMessage,
    );
    this.props.onSetMediaOptionsOpen(false);
    this.props.onSetSickerOpen(false);
    if (!isEdit) {
      let socketMessage = {
        current_user: this.props.user?.user.id,
        active_user:
          selectedUser.is_room == 0 || selectedUser.is_room === undefined
            ? selectedUser.user_id === undefined
              ? selectedUser.id
              : selectedUser.user_id
            : null,
        active_room:
          selectedUser.is_room == 1
            ? selectedUser.user_id === undefined
              ? selectedUser.id
              : selectedUser.user_id
            : null,
        chat_meta_id: selectedUser.chat_meta_id,
        message_content: sendMessage,
        message_type: this.props.replyState ? 8 : messageType,
        random_id: randomId,
      };
      // Save To Db
      let newMessageArray = {
        data: {
          data: [
            {
              chats: [message],
              is_room: message.is_room === undefined ? 0 : message.is_room,
              room_id: message.is_room === 1 ? message.chatUser : null,
              user_id:
                message.is_room === 0 || message.is_room === undefined
                  ? message.chatUser
                  : null,
            },
          ],
        },
      };
      let tableName = 'messages_list_table';
      let resp = newMessageArray;
      let onlineUserId = this.props.user?.user.id;

      // Save in state
      this.setState(previousState => ({
        messages: GiftedChat.append(previousState.messages, [message]),
      }));
      // Send to db
      MessagesQuieries.insertAndUpdateMessageList(
        {tableName, resp, onlineUserId},
        res3 => {
          // save to server
          socket.emit('save_message', socketMessage);
          var data = {};
          data['user_list_sec'] = 'recent';
          data['current_user'] = this.props.user?.user.id;
          socket.emit('user_list', JSON.stringify(data));

          socket.on('user_list_change', res => {
            ChatUsersQuieries.insertAndUpdateUserList(
              'users_list_table',
              res?.chat_list,
              this.props?.user?.user.id,
            );
            socket.off('user_list');
            socket.off('user_list_change');
          });
        },
      );
    } else {
      this.props.onSetMessageEdit(false);
      let token = this.props.user?.token;
      let formData = new FormData();
      formData.append(
        'active_user',
        this.props.longPress[0].is_room === 0
          ? this.props.longPress[0].chatUser
          : 0,
      );
      formData.append(
        'active_room',
        this.props.longPress[0].is_room === 1
          ? this.props.longPress[0].chatUser.id
          : 0,
      );
      formData.append('message_content', sendMessage);
      formData.append('message_type', messageType);
      formData.append('message_method', 'edit');
      formData.append('edit_id', this.props.longPress[0].id);

      ChatServices.editMessage(formData, token).then(res => {
        if (res.data.errors.length > 0) {
          Toast.show('Editable time exceeded', Toast.SHORT);
        }
      });
    }
    this.props.onSetOnLongPress([]);
    this.props.onSetReplyState(false);
  };

  markMessagesAsRead = messages => {
    const {selectedUser} = this.props?.route?.params;
    let ids = messages
      .filter(
        element =>
          (element.is_read == null || element.is_read == 0) &&
          element.status != 2 &&
          element.sender_id !== this.props.user?.user.id,
      )
      .map(({_id}) => _id);

    if (ids.length > 0) {
      let payload = {
        read_messages: ids,
        active_user: selectedUser.is_room === 0 ? selectedUser?.user_id : null,
        current_user: this.props.user?.user.id,
      };
      socket.emit('message_read', JSON.stringify(payload));
      this.setState({unreadMessages: []});
    }
  };

  renderMessage(props) {
    const {theme} = this.props;
    if (
      props.currentMessage.id === this.state.highlightIndex &&
      this.state.shouldScrollToIndex === true
    ) {
      this.setState({shouldScrollToIndex: false});
      this.chatRef?._messageContainerRef?.current?.scrollToIndex({
        index: this.state.navIndex,
        animated: true,
        viewPosition: 0.5,
      });

      setTimeout(() => {
        this.setState({highlightIndex: 0, navIndex: -1});
      }, 2000);
    }

    if (
      this.state.unreadMessages.length > 0 &&
      props.nextMessage.id === this.state.unreadMessages[0]?.id &&
      this.state.isFirstLoading
    ) {
      this.setState({isFirstLoading: false});

      let ind = this.state.messages.findIndex(
        x => parseInt(x.id) === parseInt(this.state.unreadMessages[0].id),
      );

      setTimeout(() => {
        this.chatRef?._messageContainerRef?.current?.scrollToIndex({
          index: ind,
          animated: true,
          viewPosition: 0.5,
        });
      }, 10);
    }
    return (
      <View>
        {this.state.unreadMessages.length > 0 &&
          props.currentMessage.id === this.state.unreadMessages[0].id && (
            <View style={styles.unreadMessages}>
              <Text>{this.state.unreadMessages.length} Unread Messages</Text>
            </View>
          )}

        <MessageItem
          theme={theme}
          {...props}
          navProps={this.props.navigation}
          isEdited={this.state.isEdited}
          keywords={
            this.props.route.params.keywords === undefined
              ? null
              : this.props.route.params.keywords
          }
          backgroundColor={
            props.currentMessage.id === this.state.highlightIndex
              ? '#C2DBDF'
              : 'transparent'
          }
        />
      </View>
    );
  }

  renderToolbar(props) {
    return (
      <Animated.View
        style={{
          bottom: this.state.keyboardOffset,
          position: 'absolute',
          left: 0,
          right: 0,
        }}>
        {/* <ImageBackground source={require('../../../assets/chat_bg.jpg')}> */}
        <MessageInputToolBar
          {...props}
          onSendTextMessage={data =>
            this.onSendMessage(data, 1, this.props.messageEdit)
          }
          onSendReplyMessage={data => {
            if (data != null && data.trim() != '') {
              this.onSendMessage(data, 1);
            }
          }}
          onSendAudioMessage={data => this.onSendMessage(data, 7)}
        />
        {/* </ImageBackground> */}
      </Animated.View>
    );
  }

  renderMediaOptions = select => {
    if (select === 'mediaOptionOpen') {
      return <MediaOptions />;
    } else if (select === 'stickers') {
      return (
        <Stickers
          stickers={this.props.stickers}
          selectedSticker={data =>
            this.onSendMessage(data, 4, this.props.messageEdit)
          }
        />
      );
    }
  };

  componentDidUpdate = (prevProps, prevState) => {
    if (prevState.minInputToolbarHeight != this.state.minInputToolbarHeight) {
      this.chatRef.resetInputToolbar();
    }
    if (this.props.navReply !== null) {
      if (prevState?.messages.length !== 0) {
        let ind = prevState?.messages.findIndex(
          x =>
            parseInt(x._id) ===
            parseInt(this.props.navReply?.reply_message.reply_id),
        );
        if (ind !== -1) {
          setTimeout(() => {
            this.setState({
              highlightIndex: prevState?.messages[ind].id,
              navIndex: ind,
              shouldScrollToIndex: true,
            });
            this.props.onSetReplyNavigate(null);
          }, 50);
        }
      }
    }
  };
  messageUpdateResponse = data => {
    this.setMessageAsGifted(data);
  };

  isCloseToTop({layoutMeasurement, contentOffset, contentSize}) {
    const paddingToTop = 20;
    return (
      contentSize.height - layoutMeasurement.height - paddingToTop <=
      contentOffset.y
    );
  }

  isCloseToBottom = ({contentOffset}) => {
    const paddingToBottom = 20;
    return contentOffset.y <= paddingToBottom;
  };

  onViewableItemsChanged = async ({viewableItems, changed}) => {
    if (viewableItems[0].index > 0) {
      this.setState({showDownBtn: true});
    } else {
      this.setState({showDownBtn: false});
    }

    let date = viewableItems[viewableItems.length - 1].item.time.split(' ')[0];
    let tempDate = moment(date).calendar();
    let Date = tempDate.split(' at ')[0];
    renderchangedate = Date;
    if (this.state.msgDate != Date) {
      await this.setState({msgDate: Date});
    }
  };
  scrollStart = () => {
    Animated.timing(this.state.fadeAnimation, {
      toValue: 1,
      duration: 0,
    }).start();
  };
  scrollEnd = () => {
    Animated.timing(this.state.fadeAnimation, {
      toValue: 0,
      duration: 250,
    }).start();
  };

  render() {
    const {selectedUser} = this.props?.route?.params;
    return (
      <View style={{flex: 1}}>
        <SafeAreaView style={{backgroundColor: '#008069'}}></SafeAreaView>
        {this.props.mediaType !== null ? (
          <MediaUpload
            socketCallBack={(message, type) =>
              this.onSendMessage(message, type, this.props.messageEdit)
            }
          />
        ) : (
          <>
            <HomeHeader
              screen="message"
              navProps={this.props}
              userData={this.props?.route?.params.selectedUser}
              chatUserOnlineStatus={this.state.chatUserOnlineStatus}
              loginUserOnlineStatus={null}
              typingStatus={this.state.typingStatus}
              selectedUser={selectedUser}
              searchResponse={data => this.setSearchResponse(data)}
              messageupdateresponse={data => this.messageUpdateResponse(data)}
              filterdata={data => this.filterResponse(data)}
            />
            <ImageBackground
              source={require('../../../assets/chat_bg.jpg')}
              style={styles.container}>
              <Animated.View
                style={[
                  styles.changeDate,
                  {opacity: this.state.fadeAnimation},
                ]}>
                <Text style={{color: 'grey', fontWeight: '600', fontSize: 12}}>
                  {renderchangedate}
                </Text>
              </Animated.View>
              <GiftedChat
                ref={ref => (this.chatRef = ref)}
                messages={this.state.messages}
                onSend={messages => onSend(messages)}
                renderMessage={this.renderMessage.bind(this)}
                renderInputToolbar={this.renderToolbar.bind(this)}
                renderMediaOptions={data => this.renderMediaOptions(data)}
                selectedUser={this.props?.route?.params?.selectedUser}
                minInputToolbarHeight={this.state.minInputToolbarHeight}
                onSend={(type, message) => {
                  if (type === 1) {
                    this.onSendMessage(message, 1, this.props.messageEdit);
                  } else if (type === 8) {
                    this.onSendMessage(message, 1);
                  } else if (type === 7) {
                    this.onSendMessage(message, 7);
                  }
                }}
                user={{
                  _id: 2,
                }}
                listViewProps={{
                  disableVirtualization: true,
                  initialNumToRender: 20,
                  // scrollEventThrottle: 400,
                  removeClippedSubviews: false,
                  maxToRenderPerBatch: 100,
                  // legacyImplementation: true,
                  // bounces: false,
                  // updateCellsBatchingPeriod: 20,
                  // windowSize: 51,
                  onScroll: async ({nativeEvent}) => {
                    if (this.props.route.params.screen !== undefined) {
                      if (this.isCloseToTop(nativeEvent)) {
                        await this.setState({
                          searchOffsetTop: this.state.searchOffsetTop + 40,
                        });
                        this.getSearchedMessages(
                          this.props.route.params.selectedUser,
                        );
                      }
                      // else if (
                      //   this.isCloseToBottom(nativeEvent) &&
                      //   this.state.searchOffsetBottom >= 0
                      // ) {
                      //   console.log('closeToBottom');
                      //   await this.setState({
                      //     searchOffsetBottom:
                      //       this.state.searchOffsetBottom - 40,
                      //     isInverted: true,
                      //   });
                      //   this.getSearchedMessages(
                      //     this.props.route.params.selectedUser,
                      //   );
                      // }
                    } else {
                      if (this.isCloseToTop(nativeEvent)) {
                        await this.setState({offset: this.state.offset + 100});
                        this.getAllMsgsFromDb();
                      }
                    }
                  },
                  onScrollToIndexFailed: info => {
                    console.log('failed: ', info);
                    // const wait = new Promise(resolve =>
                    //   setTimeout(resolve, 500),
                    // );
                    // wait.then(() => {
                    //   this.chatRef?._messageContainerRef?.current?.scrollToIndex({
                    //     index: info.index,
                    //     animated: true,
                    //     viewPosition: 0.5,
                    //   });
                    //   this.setState({
                    //     highlightIndex: this.state.messages[info.index].id,
                    //   });
                    // });
                  },
                  onViewableItemsChanged: this.onViewableItemsChanged,

                  onMomentumScrollBegin: this.scrollStart,
                  onMomentumScrollEnd: this.scrollEnd,
                  onScrollBeginDrag: this.scrollStart,
                  onScrollEndDrag: this.scrollEnd,
                }}
              />

              {this.state.showDownBtn && (
                <TouchableOpacity
                  style={styles.scrollDownBtn}
                  onPress={() => {
                    this.chatRef?._messageContainerRef?.current?.scrollToIndex({
                      index: 0,
                      animated: true,
                      viewPosition: 0,
                    });
                    if (this.state.unreadMessages.length > 0)
                      this.markMessagesAsRead(this.state.unreadMessages);
                  }}>
                  <FontAwesome
                    name={'angle-double-down'}
                    size={20}
                    color={'#000'}
                  />
                </TouchableOpacity>
              )}
            </ImageBackground>
          </>
        )}
        <SafeAreaView style={{backgroundColor: '#f9f9f9'}} />
      </View>
    );
  }
}

const mapStateToProps = state => {
  return {
    theme: state.theme.theme,
    user: state.auth.user,
    stickers: state.stickers.stickers,
    stickerOpen: state.stateHandler.stickerOpen,
    mediaOptionsOpen: state.stateHandler.mediaOptionsOpen,
    mediaType: state.stateHandler.mediaType,
    replyState: state.stateHandler.replyState,
    longPress: state.messages.longPress,
    navReply: state.messages.navReply,
    appCloseTime: state.stickers.appCloseTime,
    searchShow: state.stateHandler.searchShow,
    messageEdit: state.stateHandler.messageEdit,
  };
};

const mapDispatchToProps = dispatch => {
  return {
    onSetMediaOptionsOpen: data => {
      dispatch(setMediaOptionsOpen(data));
    },
    onSetSickerOpen: data => {
      dispatch(setSickerOpen(data));
    },
    onSetOnLongPress: data => {
      dispatch(setOnLongPress(data));
    },
    onSetReplyState: data => {
      dispatch(setReplyState(data));
    },
    onSetReplyNavigate: images => {
      dispatch(setReplyNavigate(images));
    },
    onSetSearchQuery: data => {
      dispatch(setSearchQuery(data));
    },
    onSetSearchState: data => {
      dispatch(setSearchState(data));
    },
    onSetSearchShow: data => {
      dispatch(setSearchShow(data));
    },
    onSetMessageEdit: data => {
      dispatch(setMessageEdit(data));
    },
    onSetMessageText: text => {
      dispatch(setMessageText(text));
    },
  };
};

export default connect(mapStateToProps, mapDispatchToProps)(MessageScreen);

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  videoWrapper: {
    flex: 1,
    backgroundColor: '#000000c0',
  },
  crossIconPosition: {
    position: 'absolute',
    right: 10,
    top: 10,
    zIndex: 1,
  },
  activityIndicator: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    zIndex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  unreadMessages: {
    alignSelf: 'center',
    backgroundColor: '#fff',
    borderRadius: 20,
    width: '60%',
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 10,
  },

  scrollDownBtn: {
    position: 'absolute',
    right: 10,
    bottom: 100,
    height: 40,
    width: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },

  changeDate: {
    backgroundColor: 'white',
    borderRadius: 5,
    elevation: 1,
    paddingHorizontal: 20,
    paddingVertical: 8,
    top: 5,
    alignSelf: 'center',
    position: 'absolute',
    zIndex: 100,
  },
});
