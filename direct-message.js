(function () {
    'use strict'

    angular
        .module('client.site')
        .component('messageCenter', {
            templateUrl: 'client/site/message-center/direct-message.html',
            controller: 'directMessageController',
            bindings: {
                contacts: '<'
            }
        })

    angular
        .module('client.site')
        .controller('directMessageController', DirectMessageController)

    DirectMessageController.$inject = []

    function DirectMessageController() {
        var vm = this
        vm.$onInit = init
        vm.filterDropDown = filterDropDown

        function init() {

            }


            function filterDropDown(profileFilter){
                if (vm.profileFilter == "institution admin"){
                   return {institutionId: ''}
                }
                if(vm.profileFilter == "location admin"){
                    return {locationId:  ''}
                }
                if(vm.profileFilter == 'mentor'){
                    return {menteeId : ''}
                }
                if(vm.profileFilter == 'client'){
                    return {institutionId: '!', locationId: '!', menteeId: '!' }
                }

            }


        }


})();

(function () {
    
    'use strict'

    angular
        .module('client.site')
        .component('messageCenterDetail', {
            templateUrl: 'client/site/message-center/message-center-detail/message-center-detail.html',
            controller: 'directMessageDetailController',
            bindings: {
                directMessages: '<',
                currentProfile: '<',
                contact : '<'
            }
        })

        angular
        .module('client.site')
        .controller('directMessageDetailController', DirectMessageDetailController)

    DirectMessageDetailController.$inject = ['$stateParams', '$anchorScroll', '$location', '$timeout', 'uiFeedbackService', 'messageService']

    function DirectMessageDetailController($stateParams, $anchorScroll, $location, $timeout, uiFeedbackService, messageService) {
        var vm = this

        vm.$onInit = init
        vm.formData = {
            destination: {},
            profile: {
                user: {}
            }
        }
        vm.senderProfileId = null
        vm.receiverProfileId = null

        vm.isCurrentUser = _isCurrentUser
        vm.submitReply = _submitReply
        vm.scrollToBottom = _scrollToBottom
        vm.refreshChat = _refreshChat

        function init() {
            vm.senderProfileId = $stateParams.senderProfileId
            vm.receiverProfileId = vm.currentProfile._id
            _scrollToBottom()

        }

        function _isCurrentUser(senderProfileId) {
            return (senderProfileId == vm.receiverProfileId)
        }

        function _refreshChat() {
            messageService.readAll(null, null, null, null, null, null, $stateParams.senderProfileId)
                .then(data => {
                    vm.directMessages.messages = data.items.messages
                    _scrollToBottom()
                })
        }

        function _submitReply() {
            vm.formData.profileId = vm.receiverProfileId

            vm.formData.profile.user.defaultImageUrl = vm.currentProfile.profileOverrides.imageUrl ? vm.currentProfile.profileOverrides.imageUrl : vm.currentProfile.user.defaultDisplayName

            vm.formData.profile.user.defaultDisplayName= vm.currentProfile.profileOverrides.name ? vm.currentProfile.profileOverrides.name : vm.currentProfile.user.defaultDisplayName

            vm.formData.destination.id = vm.senderProfileId
            vm.formData.destination.type = 'direct'

            messageService.create(vm.formData)
                .then(response => {
                    vm.directMessages.messages.push(vm.formData)
                    vm.formData = {
                        destination: {},
                        profile: {
                            user: {}
                        }
                    }
                    _scrollToBottom()
                }).catch(response => uiFeedbackService.error(response.name, true))
        }

        function _scrollToBottom() {
            $timeout(() => {
                $location.hash('bottom')
                $anchorScroll()
            })
        }

    }

})();